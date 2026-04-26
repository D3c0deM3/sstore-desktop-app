use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::thread;
use tauri::Manager;
use time::{Month, OffsetDateTime};

const DATABASE_FILE_NAME: &str = "sstore.sqlite";
const CURRENT_SCHEMA_VERSION: i64 = 7;
static SCANNER_SERVER: OnceLock<ScannerServerInfo> = OnceLock::new();

#[derive(Serialize)]
pub struct DesktopHealth {
    pub mode: String,
    pub database_path: String,
    pub schema_version: i64,
    pub default_session: Option<Value>,
    pub scanner_server: Option<ScannerServerInfo>,
}

#[derive(Serialize, Clone)]
pub struct ScannerServerInfo {
    pub host: String,
    pub port: u16,
    pub base_url: String,
}

#[derive(Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub headers: Option<Value>,
    pub body: Option<Value>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: Value,
    pub content_type: String,
}

#[derive(Debug, Clone)]
struct MarketSession {
    id: i64,
}

#[derive(Debug, Clone)]
struct StockBatchAllocation {
    batch_id: i64,
    quantity: f64,
    cost_per_quantity: f64,
}

pub fn ensure_database(app: &tauri::AppHandle) -> Result<DesktopHealth, String> {
    let db_path = database_path(app)?;
    let conn = open_connection(&db_path)?;
    run_migrations(&conn).map_err(|err| err.to_string())?;
    import_legacy_database_if_empty(app, &conn).map_err(|err| err.to_string())?;
    let scanner_server = ensure_scanner_server(db_path.clone()).ok();

    Ok(DesktopHealth {
        mode: "desktop".to_string(),
        database_path: db_path.display().to_string(),
        schema_version: CURRENT_SCHEMA_VERSION,
        default_session: default_desktop_session(&conn)?,
        scanner_server,
    })
}

pub fn handle_api(app: &tauri::AppHandle, request: ApiRequest) -> Result<ApiResponse, String> {
    let db_path = database_path(app)?;
    let conn = open_connection(&db_path)?;
    run_migrations(&conn).map_err(|err| err.to_string())?;
    import_legacy_database_if_empty(app, &conn).map_err(|err| err.to_string())?;

    let method = request.method.to_uppercase();
    let path = normalize_path(&request.path);
    let body = request.body.unwrap_or_else(|| json!({}));

    let response = match (method.as_str(), path.as_str()) {
        ("GET", "/api/check/") | ("GET", "/api/check") => {
            ok(json!({"message": "Desktop API is running"}))
        }
        ("POST", "/api/signup/") | ("POST", "/api/signup") => signup(&conn, &body)?,
        ("POST", "/api/login/") | ("POST", "/api/login") => login(&conn, &body)?,
        ("POST", "/api/logout/") | ("POST", "/api/logout") => {
            let market = match authenticate(&conn, request.headers.as_ref()) {
                Ok(market) => market,
                Err(message) => return Ok(error(401, &message)),
            };
            conn.execute(
                "UPDATE markets SET token = NULL WHERE id = ?1",
                params![market.id],
            )
            .map_err(|err| err.to_string())?;
            ok(json!({"message": "Successfully logged out"}))
        }
        _ => {
            let market = match authenticate(&conn, request.headers.as_ref()) {
                Ok(market) => market,
                Err(message) => return Ok(error(401, &message)),
            };
            route_authenticated(&conn, &method, &path, &body, &market)?
        }
    };

    Ok(response)
}

fn route_authenticated(
    conn: &Connection,
    method: &str,
    path: &str,
    body: &Value,
    market: &MarketSession,
) -> Result<ApiResponse, String> {
    match (method, path) {
        ("GET", "/api/dashboard/") | ("GET", "/api/dashboard") => dashboard(conn, market),
        ("GET", "/api/profile/") | ("GET", "/api/profile") => {
            ok_result(market_json(conn, market.id)?)
        }
        ("POST", "/api/profile/") | ("POST", "/api/profile") => profile_update(conn, market, body),
        ("GET", "/api/categories/") | ("GET", "/api/categories") => {
            ok_result(json!(categories_json(conn, market.id)?))
        }
        ("POST", "/api/categories/create/") | ("POST", "/api/categories/create") => {
            let name = text(body, "name");
            if name.is_empty() {
                return Ok(error(400, "Category name is required"));
            }
            conn.execute(
                "INSERT INTO categories (market_id, name, date) VALUES (?1, ?2, ?3)",
                params![market.id, name, now_iso()],
            )
            .map_err(|err| err.to_string())?;
            Ok(ok(json!({"message": "Category created successfully"})))
        }
        ("GET", "/api/categories/products/") | ("GET", "/api/categories/products") => {
            categories_with_products(conn, market)
        }
        ("POST", "/api/market/plan/") | ("POST", "/api/market/plan") => {
            update_market_plan(conn, market, body)
        }
        ("GET", "/api/products/") | ("GET", "/api/products") => products_index(conn, market),
        ("GET", "/api/products/low-stock/") | ("GET", "/api/products/low-stock") => {
            low_stock_products(conn, market)
        }
        ("POST", "/api/products/barcode/") | ("POST", "/api/products/barcode") => {
            product_by_barcode(conn, market, body)
        }
        ("POST", "/api/scanner/events/latest/") | ("POST", "/api/scanner/events/latest") => {
            scanner_latest_event(conn, market, body)
        }
        ("GET", "/api/scanner/status/") | ("GET", "/api/scanner/status") => {
            scanner_status(conn, market)
        }
        ("POST", "/api/products/create/") | ("POST", "/api/products/create") => {
            product_create(conn, market, body)
        }
        ("DELETE", "/api/products/delete/several/")
        | ("DELETE", "/api/products/delete/several") => product_delete_several(conn, market, body),
        ("GET", "/api/products/report/") | ("GET", "/api/products/report") => {
            products_report(conn, market)
        }
        ("GET", "/api/reports/summary/") | ("GET", "/api/reports/summary") => {
            reports_summary(conn, market)
        }
        ("GET", "/api/sales/") | ("GET", "/api/sales") => sales_index(conn, market),
        ("POST", "/api/sell/") | ("POST", "/api/sell") => save_product_updates(conn, market, body),
        ("POST", "/api/returns/") | ("POST", "/api/returns") => {
            return_sale_item(conn, market, body)
        }
        ("POST", "/api/buy/") | ("POST", "/api/buy") => save_bought_products(conn, market, body),
        ("GET", "/api/suppliers/") | ("GET", "/api/suppliers") => suppliers_index(conn, market),
        ("POST", "/api/suppliers/create/") | ("POST", "/api/suppliers/create") => {
            supplier_create(conn, market, body)
        }
        ("GET", "/api/purchases/") | ("GET", "/api/purchases") => purchases_index(conn, market),
        ("POST", "/api/purchases/create/") | ("POST", "/api/purchases/create") => {
            purchase_create(conn, market, body)
        }
        ("POST", "/api/inventory/audit/") | ("POST", "/api/inventory/audit") => {
            inventory_audit(conn, market, body)
        }
        ("GET", "/api/debtors/") | ("GET", "/api/debtors") => {
            ok_result(json!(debtors_json(conn, market.id)?))
        }
        ("POST", "/api/debtors/payment/") | ("POST", "/api/debtors/payment") => {
            debtor_payment(conn, market, body)
        }
        ("GET", "/api/debts/") | ("GET", "/api/debts") => Ok(ok(json!([]))),
        ("GET", "/api/expense/") | ("GET", "/api/expense") => expenses(conn, market),
        ("GET", "/api/expense/types/") | ("GET", "/api/expense/types") => Ok(ok(json!({
            "salary": "Maosh",
            "rent": "Ijara",
            "tax": "Soliq",
            "ad": "Reklama",
            "licence": "Litsenziya",
            "communal": "Komunal to'lovlar",
            "other": "Boshqa"
        }))),
        ("POST", "/api/expense/add/") | ("POST", "/api/expense/add") => {
            let expense_type = text(body, "type");
            let price = number(body, "price");
            conn.execute(
                "INSERT INTO expenses (market_id, type, price, date) VALUES (?1, ?2, ?3, ?4)",
                params![market.id, expense_type, price, now_iso()],
            )
            .map_err(|err| err.to_string())?;
            Ok(ok(json!({"message": "Expense saved successfully"})))
        }
        ("GET", "/api/history/") | ("GET", "/api/history") => history(conn, market),
        _ => route_dynamic(conn, method, path, body, market),
    }
}

fn route_dynamic(
    conn: &Connection,
    method: &str,
    path: &str,
    body: &Value,
    market: &MarketSession,
) -> Result<ApiResponse, String> {
    if let Some(id) = path_id(path, "/api/categories/delete/", "/") {
        if method == "DELETE" {
            conn.execute(
                "DELETE FROM categories WHERE id = ?1 AND market_id = ?2",
                params![id, market.id],
            )
            .map_err(|err| err.to_string())?;
            return Ok(ok(json!({"message": "Category deleted successfully"})));
        }
    }

    if let Some(id) = path_id(path, "/api/categories/update/", "/") {
        if method == "PUT" {
            let name = text(body, "name");
            if name.is_empty() {
                return Ok(error(400, "Category name is required"));
            }
            conn.execute(
                "UPDATE categories SET name = ?1 WHERE id = ?2 AND market_id = ?3",
                params![name, id, market.id],
            )
            .map_err(|err| err.to_string())?;
            return Ok(ok(json!({"message": "Category updated successfully"})));
        }
    }

    if let Some(id) = path_id(path, "/api/products/edit/", "/") {
        if method == "GET" {
            return ok_result(product_json(conn, market.id, id)?);
        }
    }

    if let Some(id) = path_id(path, "/api/products/update/", "/") {
        if method == "PUT" {
            return product_update(conn, market, id, body);
        }
    }

    if let Some(id) = path_id(path, "/api/products/delete/", "/") {
        if method == "DELETE" {
            conn.execute(
                "DELETE FROM products
                 WHERE id = ?1 AND category_id IN (SELECT id FROM categories WHERE market_id = ?2)",
                params![id, market.id],
            )
            .map_err(|err| err.to_string())?;
            return Ok(ok(json!({"message": "Product deleted successfully"})));
        }
    }

    if let Some(id) = path_id(path, "/api/products/", "/") {
        if method == "GET" {
            return product_detail(conn, market, id);
        }
    }

    if let Some(id) = path_id(path, "/api/sales/", "/") {
        if method == "GET" {
            return sale_detail(conn, market, id);
        }
    }

    if let Some(id) = path_id(path, "/api/debtors/delete/", "/") {
        if method == "DELETE" {
            return delete_debt(conn, market, id);
        }
    }

    if let Some(id) = path_id(path, "/api/debtors/", "/") {
        if method == "GET" {
            return get_debtors_debts(conn, market, id);
        }
    }

    if let Some(id) = path_id(path, "/api/history/delete/", "/") {
        if method == "DELETE" {
            return history_delete(conn, market, id);
        }
    }

    if let Some(id) = path_id(path, "/api/history/edit/", "/") {
        if method == "GET" {
            return ok_result(product_update_json(conn, market, id)?);
        }
    }

    if let Some(id) = path_id(path, "/api/history/update/", "/") {
        if method == "PUT" {
            return history_update(conn, market, id, body);
        }
    }

    Ok(error(404, "Endpoint not implemented in local desktop API"))
}

fn signup(conn: &Connection, body: &Value) -> Result<ApiResponse, String> {
    let phone_number = text(body, "phone_number");
    let market_name = text(body, "market_name");
    let password = text(body, "password");
    let profile_picture = media_value(body, &["profile_picture", "store_image", "image"]);

    if phone_number.is_empty() || market_name.is_empty() || password.is_empty() {
        return Ok(error(
            400,
            "Store name, phone number and password are required",
        ));
    }

    let token = make_token();
    let result = conn.execute(
        "INSERT INTO markets (phone_number, market_name, profile_picture, plan, password, token, created_at)
         VALUES (?1, ?2, ?3, 'Basic', ?4, ?5, ?6)",
        params![phone_number, market_name, profile_picture, password, token, now_iso()],
    );

    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            let market = market_json(conn, id)?;
            Ok(ok(json!({"token": token, "market": market})))
        }
        Err(err) => Ok(error(400, &err.to_string())),
    }
}

fn login(conn: &Connection, body: &Value) -> Result<ApiResponse, String> {
    let phone_number = text(body, "phone_number");
    let password = text(body, "password");

    if phone_number.is_empty() || password.is_empty() {
        return Ok(error(400, "Phone number and password are required"));
    }

    let row = conn
        .query_row(
            "SELECT id, password FROM markets WHERE phone_number = ?1",
            params![phone_number],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    let Some((id, saved_password)) = row else {
        return Ok(error(401, "Invalid credentials"));
    };

    if saved_password != password {
        return Ok(error(401, "Invalid credentials"));
    }

    let token = make_token();
    conn.execute(
        "UPDATE markets SET token = ?1 WHERE id = ?2",
        params![token, id],
    )
    .map_err(|err| err.to_string())?;
    let market = market_json(conn, id)?;
    Ok(ok(json!({"token": token, "market": market})))
}

fn dashboard(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let products = products_json(conn, market.id, None)?;
    let quantity: f64 = products
        .iter()
        .map(|product| {
            product
                .get("quantity")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
        })
        .sum();
    let products_by_sells = products_json(conn, market.id, Some("sells"))?;
    let products_by_price = products_json(conn, market.id, Some("price"))?;
    let profit = month_profit(conn, market.id)?;
    let income = month_income(conn, market.id)?;
    let products_added = sum_update_quantities_market(conn, market.id, "added")?;
    let products_subbed = sum_update_quantities_market(conn, market.id, "subed")?;
    let operating_expenses_total = month_expenses(conn, market.id)?;
    let purchase_expenses_total = month_inventory_purchases(conn, market.id)?;
    let expanses_total = operating_expenses_total + purchase_expenses_total;

    Ok(ok(json!([
        {"products": products},
        {"quantity": quantity},
        {"products_by_sells": products_by_sells},
        {"products_by_price": products_by_price},
        {"profit": profit},
        {"market_data": market_json(conn, market.id)?},
        {"income": income},
        {"expanses_total": expanses_total},
        {"operating_expenses_total": operating_expenses_total},
        {"purchase_expenses_total": purchase_expenses_total},
        {"products_subbed": products_subbed},
        {"products_added": products_added},
        {"current_month": current_month_name()}
    ])))
}

fn products_index(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let products = products_json(conn, market.id, None)?;
    let products_quantity = products.len();
    let available_products = products
        .iter()
        .filter(|p| p["status"] == "available")
        .count();
    let few_products = products.iter().filter(|p| p["status"] == "few").count();
    let ended_products = products.iter().filter(|p| p["status"] == "ended").count();

    Ok(ok(json!({
        "products": products,
        "products_quantity": products_quantity,
        "available_products": available_products,
        "few_products": few_products,
        "ended_products": ended_products
    })))
}

fn low_stock_products(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let products = products_json(conn, market.id, None)?
        .into_iter()
        .filter(|product| {
            product["quantity"].as_f64().unwrap_or(0.0)
                <= product["min_quantity"].as_f64().unwrap_or(0.0)
        })
        .collect::<Vec<_>>();
    Ok(ok(json!(products)))
}

fn product_by_barcode(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let barcode = text(body, "barcode");
    if barcode.is_empty() {
        return Ok(error(400, "Barcode is required"));
    }
    let product_id = conn
        .query_row(
            "SELECT b.product_id
             FROM barcodes b
             JOIN products p ON p.id = b.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE b.number = ?1 AND c.market_id = ?2
             LIMIT 1",
            params![barcode, market.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    match product_id {
        Some(id) => ok_result(product_json(conn, market.id, id)?),
        None => Ok(error(404, "Product not found for barcode")),
    }
}

fn scanner_latest_event(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let last_event_id = integer(body, "last_event_id");
    let event = conn
        .query_row(
            "SELECT id, barcode, source, created_at
             FROM scanner_events
             WHERE market_id = ?1 AND id > ?2
             ORDER BY id ASC
             LIMIT 1",
            params![market.id, last_event_id],
            |row| {
                Ok(json!({
                    "id": row.get::<_, i64>(0)?,
                    "barcode": row.get::<_, String>(1)?,
                    "source": row.get::<_, String>(2)?,
                    "created_at": row.get::<_, String>(3)?
                }))
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;

    Ok(ok(json!({ "event": event })))
}

fn scanner_status(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let last_seen_at = conn
        .query_row(
            "SELECT last_seen_at FROM scanner_clients WHERE market_id = ?1",
            params![market.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .unwrap_or(0);
    let now = OffsetDateTime::now_utc().unix_timestamp();
    let connected = last_seen_at > 0 && now.saturating_sub(last_seen_at) <= 8;

    Ok(ok(json!({
        "connected": connected,
        "last_seen_at": last_seen_at,
        "expires_in": if connected { 8 - now.saturating_sub(last_seen_at) } else { 0 }
    })))
}

fn update_market_plan(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let plan = text(body, "plan");
    if plan.is_empty() {
        return Ok(error(400, "Plan is required"));
    }

    conn.execute(
        "UPDATE markets SET plan = ?1 WHERE id = ?2",
        params![plan, market.id],
    )
    .map_err(|err| err.to_string())?;

    Ok(ok(
        json!({"message": "Plan updated successfully", "market": market_json(conn, market.id)?}),
    ))
}

fn profile_update(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let market_name = text(body, "market_name");
    let phone_number = text(body, "phone_number");
    let password = text(body, "password");
    let remove_profile_picture = body
        .get("remove_profile_picture")
        .and_then(|value| {
            value
                .as_bool()
                .or_else(|| value.as_str().map(|text| text == "true" || text == "1"))
        })
        .unwrap_or(false);
    let profile_picture = media_value(body, &["profile_picture", "store_image", "image"]);

    if market_name.is_empty() || phone_number.is_empty() {
        return Ok(error(400, "Store name and phone number are required"));
    }

    let duplicate_phone = conn
        .query_row(
            "SELECT id FROM markets WHERE phone_number = ?1 AND id != ?2",
            params![phone_number, market.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if duplicate_phone.is_some() {
        return Ok(error(400, "Phone number is already used"));
    }

    conn.execute(
        "UPDATE markets
         SET market_name = ?1,
             phone_number = ?2,
             profile_picture = CASE
                WHEN ?3 THEN NULL
                WHEN ?4 IS NOT NULL THEN ?4
                ELSE profile_picture
             END,
             password = CASE WHEN ?5 = '' THEN password ELSE ?5 END
         WHERE id = ?6",
        params![
            market_name,
            phone_number,
            remove_profile_picture,
            profile_picture,
            password,
            market.id
        ],
    )
    .map_err(|err| err.to_string())?;

    Ok(ok(json!({
        "message": "Profile updated successfully",
        "market": market_json(conn, market.id)?
    })))
}

fn product_create(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let category_id = integer(body, "category_id");
    let name = text(body, "name");
    let quantity = number(body, "quantity");
    let min_quantity = number_default(body, "min_quantity", 50.0);
    let quantity_type = text_default(body, "quantity_type", "dona");
    let price_per_quantity = number(body, "price_per_quantity");
    let cost_per_quantity = number_default(body, "bought_price", 0.0);
    let bought_total = cost_per_quantity * quantity;
    let image = image_value(body);
    let barcode = text(body, "barcode");
    let expiry_date = text(body, "expiry_date");
    let batch_number = text_default(body, "batch_number", "default");
    let status = product_status(quantity, min_quantity);

    if category_id <= 0 || name.is_empty() {
        return Ok(error(400, "Category and product name are required"));
    }
    if !category_belongs_to_market(conn, category_id, market.id)? {
        return Ok(error(404, "Category not found"));
    }

    conn.execute(
        "INSERT INTO products (category_id, name, quantity, min_quantity, quantity_type, price_per_quantity, cost_per_quantity, image, status, date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![category_id, name, quantity, min_quantity, quantity_type, price_per_quantity, cost_per_quantity, image, status, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    let product_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO product_updates (product_id, status, quantity, price, debtor_id, date)
         VALUES (?1, 'added', ?2, ?3, NULL, ?4)",
        params![product_id, quantity, bought_total, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    conn.execute(
        "INSERT INTO stock_movements (product_id, sale_id, movement_type, quantity, reason, created_at)
         VALUES (?1, NULL, 'in', ?2, 'initial_stock', ?3)",
        params![product_id, quantity, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    if !barcode.is_empty() {
        conn.execute(
            "INSERT OR IGNORE INTO barcodes (product_id, number, date) VALUES (?1, ?2, ?3)",
            params![product_id, barcode, now_iso()],
        )
        .map_err(|err| err.to_string())?;
    }
    conn.execute(
        "INSERT INTO stock_batches (product_id, batch_number, expiry_date, quantity, cost_per_quantity, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![product_id, batch_number, expiry_date, quantity, cost_per_quantity, now_iso()],
    )
    .map_err(|err| err.to_string())?;

    Ok(ok(
        json!({"message": "Product created and new updated saved successfully"}),
    ))
}

fn product_update(
    conn: &Connection,
    market: &MarketSession,
    product_id: i64,
    body: &Value,
) -> Result<ApiResponse, String> {
    let category_id = integer(body, "category_id");
    let name = text(body, "name");
    let quantity = number(body, "quantity");
    let min_quantity = number_optional(body, "min_quantity");
    let status_min_quantity = min_quantity.unwrap_or(50.0);
    let quantity_type = text_default(body, "quantity_type", "dona");
    let price_per_quantity = number(body, "price_per_quantity");
    let cost_per_quantity = number_optional(body, "cost_per_quantity");
    let status = text_default(
        body,
        "status",
        &product_status(quantity, status_min_quantity),
    );
    let image = image_value(body);
    let barcode = text(body, "barcode");
    if !category_belongs_to_market(conn, category_id, market.id)? {
        return Ok(error(404, "Category not found"));
    }
    let previous_cost_per_quantity = conn
        .query_row(
            "SELECT cost_per_quantity
             FROM products
             WHERE id = ?1 AND category_id IN (SELECT id FROM categories WHERE market_id = ?2)",
            params![product_id, market.id],
            |row| row.get::<_, f64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some(previous_cost_per_quantity) = previous_cost_per_quantity else {
        return Ok(error(404, "Product not found"));
    };

    conn.execute(
        "UPDATE products
         SET category_id = ?1, name = ?2, quantity = ?3, min_quantity = COALESCE(?4, min_quantity), quantity_type = ?5,
             price_per_quantity = ?6, cost_per_quantity = COALESCE(?7, cost_per_quantity), image = COALESCE(?8, image), status = ?9
         WHERE id = ?10 AND category_id IN (SELECT id FROM categories WHERE market_id = ?11)",
        params![category_id, name, quantity, min_quantity, quantity_type, price_per_quantity, cost_per_quantity, image, status, product_id, market.id],
    )
    .map_err(|err| err.to_string())?;
    if let Some(new_cost_per_quantity) = cost_per_quantity {
        conn.execute(
            "UPDATE stock_batches
             SET cost_per_quantity = ?1
             WHERE product_id = ?2
               AND quantity > 0
               AND ABS(cost_per_quantity - ?3) <= CASE
                    WHEN ?3 * 0.001 > 0.01 THEN ?3 * 0.001
                    ELSE 0.01
               END",
            params![
                new_cost_per_quantity,
                product_id,
                previous_cost_per_quantity
            ],
        )
        .map_err(|err| err.to_string())?;
    }
    if !barcode.is_empty() {
        conn.execute(
            "INSERT OR IGNORE INTO barcodes (product_id, number, date) VALUES (?1, ?2, ?3)",
            params![product_id, barcode, now_iso()],
        )
        .map_err(|err| err.to_string())?;
    }

    Ok(ok(json!({"message": "Product updated successfully"})))
}

fn product_delete_several(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    if let Some(ids) = body.get("ids").and_then(Value::as_array) {
        for id in ids.iter().filter_map(Value::as_i64) {
            conn.execute(
                "DELETE FROM products
                 WHERE id = ?1 AND category_id IN (SELECT id FROM categories WHERE market_id = ?2)",
                params![id, market.id],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    Ok(ok(json!({"message": "Products deleted successfully"})))
}

fn product_detail(
    conn: &Connection,
    market: &MarketSession,
    product_id: i64,
) -> Result<ApiResponse, String> {
    let product = product_json(conn, market.id, product_id)?;
    let product_sold = product_updates_json(conn, Some(product_id), None, Some("subed"))?;
    let product_bought = product_updates_json(conn, Some(product_id), None, Some("added"))?;
    let total_sold = product_sold
        .iter()
        .map(|u| u["price"].as_f64().unwrap_or(0.0))
        .sum::<f64>();
    let total_bought = product_bought
        .iter()
        .map(|u| u["price"].as_f64().unwrap_or(0.0))
        .sum::<f64>();

    Ok(ok(json!({
        "product": product,
        "product_sold": product_sold,
        "product_bought": product_bought,
        "total_sold": total_sold,
        "total_bought": total_bought
    })))
}

fn products_report(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let products = products_json(conn, market.id, None)?;
    let mut rows = vec!["Mahsulot nomi,Kategoriya,Qoldiq,Status,Narx".to_string()];
    for product in products {
        rows.push(format!(
            "{},{},{},{},{}",
            csv(&product["name"]),
            csv(&product["category_name"]),
            product["quantity"].as_f64().unwrap_or(0.0),
            csv(&product["status"]),
            product["price_per_quantity"].as_f64().unwrap_or(0.0)
        ));
    }
    Ok(ApiResponse {
        status: 200,
        body: json!({"text": rows.join("\n")}),
        content_type: "text/csv".to_string(),
    })
}

fn sales_index(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM sales WHERE market_id = ?1 ORDER BY created_at DESC LIMIT 100")
        .map_err(|err| err.to_string())?;
    let ids = stmt
        .query_map(params![market.id], |row| row.get::<_, i64>(0))
        .map_err(|err| err.to_string())?;
    let mut sales = Vec::new();
    for id in collect_vec(ids)? {
        sales.push(sale_json(conn, market.id, id)?);
    }
    Ok(ok(json!(sales)))
}

fn sale_detail(
    conn: &Connection,
    market: &MarketSession,
    sale_id: i64,
) -> Result<ApiResponse, String> {
    Ok(ok(json!({
        "sale": sale_json(conn, market.id, sale_id)?,
        "receipt": receipt_json(conn, market.id, sale_id)?
    })))
}

fn reports_summary(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let prefix = current_month_prefix();
    let products = products_json(conn, market.id, None)?;
    let low_stock = products
        .iter()
        .filter(|product| {
            product["quantity"].as_f64().unwrap_or(0.0)
                <= product["min_quantity"].as_f64().unwrap_or(0.0)
        })
        .cloned()
        .collect::<Vec<_>>();
    let dead_stock = products
        .iter()
        .filter(|product| product["total_subtracted"].as_f64().unwrap_or(0.0) <= 0.0)
        .cloned()
        .collect::<Vec<_>>();
    let mut top_products = products.clone();
    top_products.sort_by(|a, b| {
        b["total_subtracted"]
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&a["total_subtracted"].as_f64().unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    top_products.truncate(10);

    let daily_sales = sales_grouped_by_day(conn, market.id, &prefix)?;
    let expense_report = expenses_json(conn, market.id, Some(&prefix))?;
    let debt_report = debtors_json(conn, market.id)?;
    let returns_total = month_returns(conn, market.id)?;
    let income = month_income(conn, market.id)?;
    let operating_expenses_total = month_expenses(conn, market.id)?;
    let purchase_expenses_total = month_inventory_purchases(conn, market.id)?;
    let expenses_total = operating_expenses_total + purchase_expenses_total;
    let cogs = month_cogs(conn, market.id)?;

    Ok(ok(json!({
        "daily_sales": daily_sales,
        "monthly_profit": income - cogs - operating_expenses_total,
        "income": income,
        "cost_of_goods": cogs,
        "expenses_total": expenses_total,
        "operating_expenses_total": operating_expenses_total,
        "purchase_expenses_total": purchase_expenses_total,
        "returns_total": returns_total,
        "top_products": top_products,
        "dead_stock": dead_stock,
        "low_stock": low_stock,
        "debt_report": debt_report,
        "expense_report": expense_report
    })))
}

fn save_product_updates(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let sells = body
        .get("sells")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if sells.is_empty() {
        return Ok(error(400, "No products selected"));
    }
    let debtor_name = text(body, "debtor_name");
    let debtor_phone = text(body, "debtor_phone");
    let mut debtor_id: Option<i64> = None;
    let mut subtotal = 0.0;
    let mut message = "Product updates saved successfully".to_string();

    if !debtor_name.is_empty() {
        let existing = tx
            .query_row(
                "SELECT id, name FROM debtors WHERE market_id = ?1 AND phone = ?2",
                params![market.id, debtor_phone],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|err| err.to_string())?;

        if let Some((id, saved_name)) = existing {
            if saved_name.to_lowercase() != debtor_name.to_lowercase() {
                return Ok(error(
                    400,
                    "Bir raqamdan faqat bitta nomga qarz olish mumkin",
                ));
            }
            debtor_id = Some(id);
            message.push_str(" and debt added successfully");
        } else {
            tx.execute(
                "INSERT INTO debtors (market_id, name, phone, price, date) VALUES (?1, ?2, ?3, 0, ?4)",
                params![market.id, debtor_name, debtor_phone, now_iso()],
            )
            .map_err(|err| err.to_string())?;
            debtor_id = Some(tx.last_insert_rowid());
            message.push_str(" and debtor added successfully");
        }
    }

    let mut normalized_items: Vec<(
        i64,
        String,
        f64,
        f64,
        f64,
        f64,
        f64,
        Vec<StockBatchAllocation>,
    )> = Vec::new();
    for item in sells {
        let product_id = integer(&item, "product_id");
        let quantity = number(&item, "quantity");
        let unit_price = number(&item, "price");
        let item_discount = number_default(&item, "discount", 0.0);
        if quantity <= 0.0 || unit_price < 0.0 {
            return Ok(error(400, "Quantity and price must be positive"));
        }
        let product = tx
            .query_row(
                "SELECT p.name, p.quantity, p.cost_per_quantity
                 FROM products p
                 JOIN categories c ON c.id = p.category_id
                 WHERE p.id = ?1 AND c.market_id = ?2",
                params![product_id, market.id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, f64>(1)?,
                        row.get::<_, f64>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|err| err.to_string())?;
        let Some((product_name, available_quantity, cost_per_quantity)) = product else {
            return Ok(error(404, "Product not found"));
        };
        if available_quantity < quantity {
            return Ok(ApiResponse {
                status: 400,
                body: json!({
                    "error": format!("{product_name} omborda yetarli emas"),
                    "product_id": product_id,
                    "available_quantity": available_quantity
                }),
                content_type: "application/json".to_string(),
            });
        }
        let line_subtotal = unit_price * quantity;
        if item_discount < 0.0 || item_discount > line_subtotal {
            return Ok(error(400, "Invalid item discount"));
        }
        let price = line_subtotal - item_discount;
        let batch_allocations =
            plan_stock_batch_allocations(&tx, product_id, quantity).map_err(|message| message)?;
        let total_batch_cost: f64 = batch_allocations
            .iter()
            .map(|allocation| allocation.quantity * allocation.cost_per_quantity)
            .sum();
        let cost_at_sale = if quantity > 0.0 {
            total_batch_cost / quantity
        } else {
            cost_per_quantity
        };
        subtotal += price;
        normalized_items.push((
            product_id,
            product_name,
            quantity,
            unit_price,
            price,
            cost_at_sale,
            item_discount,
            batch_allocations,
        ));
    }

    let discount = number(body, "discount");
    if discount < 0.0 || discount > subtotal {
        return Ok(error(400, "Invalid discount"));
    }
    let total_price = subtotal - discount;
    let mut payment_method = if !text(body, "payment_method").is_empty() {
        text(body, "payment_method")
    } else if debtor_id.is_some() {
        "debt".to_string()
    } else {
        "cash".to_string()
    };
    if !matches!(
        payment_method.as_str(),
        "cash" | "card" | "transfer" | "mixed" | "debt"
    ) {
        return Ok(error(400, "Invalid payment method"));
    }
    let payments = match payments_from_body(body, &payment_method, total_price) {
        Ok(payments) => payments,
        Err(message) => return Ok(error(400, &message)),
    };
    let paid_amount: f64 = payments.iter().map(|(_, amount)| *amount).sum();
    let unpaid_amount = (total_price - paid_amount).max(0.0);
    if unpaid_amount > 0.0 && debtor_id.is_none() {
        return Ok(error(
            400,
            "Debtor information is required for unpaid sales",
        ));
    }
    if unpaid_amount > 0.0 && payment_method != "debt" {
        payment_method = "mixed".to_string();
    }
    let receipt = make_receipt_number(market.id);

    tx.execute(
        "INSERT INTO sales (market_id, cashier, receipt_number, subtotal, discount, total, paid_amount, payment_method, debtor_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![market.id, text(body, "cashier"), receipt, subtotal, discount, total_price, paid_amount, payment_method, debtor_id, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    let sale_id = tx.last_insert_rowid();

    for (
        product_id,
        _product_name,
        quantity,
        unit_price,
        price,
        cost_per_quantity,
        item_discount,
        batch_allocations,
    ) in normalized_items
    {
        tx.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount, cost_at_sale, total_price, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![sale_id, product_id, quantity, unit_price, item_discount, cost_per_quantity, price, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        let sale_item_id = tx.last_insert_rowid();
        record_sale_item_batch_allocations(&tx, sale_item_id, &batch_allocations)?;
        consume_stock_batch_allocations(&tx, &batch_allocations)?;
        tx.execute(
            "INSERT INTO product_updates (product_id, status, quantity, price, debtor_id, sale_item_id, date)
             VALUES (?1, 'subed', ?2, ?3, ?4, ?5, ?6)",
            params![product_id, quantity, price, debtor_id, sale_item_id, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (product_id, sale_id, movement_type, quantity, reason, created_at)
             VALUES (?1, ?2, 'out', ?3, 'sale', ?4)",
            params![product_id, sale_id, quantity, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        tx.execute(
            "UPDATE products
             SET quantity = quantity - ?1,
                 status = CASE
                    WHEN quantity - ?1 <= 0 THEN 'ended'
                    WHEN quantity - ?1 <= min_quantity THEN 'few'
                    ELSE 'available'
                 END
             WHERE id = ?2 AND category_id IN (SELECT id FROM categories WHERE market_id = ?3)",
            params![quantity, product_id, market.id],
        )
        .map_err(|err| err.to_string())?;
    }

    for (method, amount) in payments {
        if amount > 0.0 {
            tx.execute(
                "INSERT INTO payments (sale_id, method, amount, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![sale_id, method, amount, now_iso()],
            )
            .map_err(|err| err.to_string())?;
        }
    }

    if let Some(id) = debtor_id {
        tx.execute(
            "UPDATE debtors SET price = price + ?1 WHERE id = ?2",
            params![unpaid_amount, id],
        )
        .map_err(|err| err.to_string())?;
    }

    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(
        json!({"message": message, "sale": sale_json(conn, market.id, sale_id)?, "receipt": receipt_json(conn, market.id, sale_id)?}),
    ))
}

fn save_bought_products(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let product_id = integer(body, "product_id");
    let quantity = number(body, "quantity");
    let price = number(body, "price");
    let supplier_name = text(body, "supplier_name");
    let supplier_phone = text(body, "supplier_phone");
    let invoice_number = text_default(
        body,
        "invoice_number",
        &make_purchase_invoice_number(market.id),
    );
    let expiry_date = text(body, "expiry_date");
    let batch_number = text_default(body, "batch_number", &invoice_number);
    if quantity <= 0.0 || price < 0.0 {
        return Ok(error(400, "Quantity and price must be positive"));
    }
    let current = tx
        .query_row(
            "SELECT p.quantity, p.cost_per_quantity
             FROM products p
             JOIN categories c ON c.id = p.category_id
             WHERE p.id = ?1 AND c.market_id = ?2",
            params![product_id, market.id],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, f64>(1)?)),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some((current_quantity, current_cost)) = current else {
        return Ok(error(404, "Product not found"));
    };
    let new_quantity = current_quantity + quantity;
    let new_cost = if new_quantity > 0.0 {
        ((current_quantity * current_cost) + price) / new_quantity
    } else {
        0.0
    };
    tx.execute(
        "INSERT INTO product_updates (product_id, status, quantity, price, debtor_id, date)
         VALUES (?1, 'added', ?2, ?3, NULL, ?4)",
        params![product_id, quantity, price, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO stock_movements (product_id, sale_id, movement_type, quantity, reason, created_at)
         VALUES (?1, NULL, 'in', ?2, 'refill', ?3)",
        params![product_id, quantity, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "UPDATE products
         SET quantity = quantity + ?1,
             cost_per_quantity = ?2,
             status = CASE
                WHEN quantity + ?1 <= 0 THEN 'ended'
                WHEN quantity + ?1 <= min_quantity THEN 'few'
                ELSE 'available'
             END
         WHERE id = ?3 AND category_id IN (SELECT id FROM categories WHERE market_id = ?4)",
        params![quantity, new_cost, product_id, market.id],
    )
    .map_err(|err| err.to_string())?;
    if !supplier_name.is_empty() {
        let supplier_id = ensure_supplier(&tx, market.id, &supplier_name, &supplier_phone)?;
        tx.execute(
            "INSERT INTO purchase_invoices (market_id, supplier_id, invoice_number, total, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![market.id, supplier_id, invoice_number, price, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        let invoice_id = tx.last_insert_rowid();
        tx.execute(
            "INSERT INTO purchase_items (invoice_id, product_id, quantity, unit_cost, total, expiry_date, batch_number)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![invoice_id, product_id, quantity, if quantity > 0.0 { price / quantity } else { 0.0 }, price, optional_text(&expiry_date), batch_number],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.execute(
        "INSERT INTO stock_batches (product_id, batch_number, expiry_date, quantity, cost_per_quantity, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![product_id, batch_number, expiry_date, quantity, if quantity > 0.0 { price / quantity } else { 0.0 }, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(json!({"message": "Product bought successfully"})))
}

fn suppliers_index(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let mut stmt = conn
        .prepare("SELECT id, market_id, name, phone, created_at FROM suppliers WHERE market_id = ?1 ORDER BY name")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market.id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "market_id": row.get::<_, i64>(1)?,
                "name": row.get::<_, String>(2)?,
                "phone": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_rows(rows)
}

fn supplier_create(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let name = text(body, "name");
    let phone = text(body, "phone");
    if name.is_empty() {
        return Ok(error(400, "Supplier name is required"));
    }
    let id = ensure_supplier(conn, market.id, &name, &phone)?;
    Ok(ok(
        json!({"message": "Supplier saved successfully", "supplier_id": id}),
    ))
}

fn purchases_index(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.invoice_number, i.total, i.created_at, s.name, s.phone
             FROM purchase_invoices i
             JOIN suppliers s ON s.id = i.supplier_id
             WHERE i.market_id = ?1
             ORDER BY i.created_at DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market.id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "invoice_number": row.get::<_, String>(1)?,
                "total": row.get::<_, f64>(2)?,
                "created_at": row.get::<_, String>(3)?,
                "supplier_name": row.get::<_, String>(4)?,
                "supplier_phone": row.get::<_, String>(5)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_rows(rows)
}

fn purchase_create(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    save_bought_products(conn, market, body)
}

fn inventory_audit(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let product_id = integer(body, "product_id");
    let counted_quantity = number(body, "quantity");
    let reason = text_default(body, "reason", "manual_adjustment");
    let current = tx
        .query_row(
            "SELECT p.quantity
             FROM products p
             JOIN categories c ON c.id = p.category_id
             WHERE p.id = ?1 AND c.market_id = ?2",
            params![product_id, market.id],
            |row| row.get::<_, f64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some(old_quantity) = current else {
        return Ok(error(404, "Product not found"));
    };
    let delta = counted_quantity - old_quantity;
    tx.execute(
        "UPDATE products
         SET quantity = ?1,
             status = CASE
                WHEN ?1 <= 0 THEN 'ended'
                WHEN ?1 <= min_quantity THEN 'few'
                ELSE 'available'
             END
         WHERE id = ?2",
        params![counted_quantity, product_id],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO inventory_audits (market_id, product_id, old_quantity, new_quantity, difference, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![market.id, product_id, old_quantity, counted_quantity, delta, reason, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO stock_movements (product_id, sale_id, movement_type, quantity, reason, created_at)
         VALUES (?1, NULL, 'adjustment', ?2, ?3, ?4)",
        params![product_id, delta, reason, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(
        json!({"message": "Inventory corrected successfully", "difference": delta}),
    ))
}

fn return_sale_item(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let sale_item_id = integer(body, "sale_item_id");
    let return_quantity = number(body, "quantity");
    let reason = text_default(body, "reason", "return");
    if return_quantity <= 0.0 {
        return Ok(error(400, "Return quantity must be positive"));
    }
    let item = tx
        .query_row(
            "SELECT si.sale_id, si.product_id, si.quantity, si.returned_quantity, si.total_price,
                    s.debtor_id, p.name
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             JOIN products p ON p.id = si.product_id
             WHERE si.id = ?1 AND s.market_id = ?2",
            params![sale_item_id, market.id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some((
        sale_id,
        product_id,
        sold_quantity,
        returned_quantity,
        total_price,
        debtor_id,
        product_name,
    )) = item
    else {
        return Ok(error(404, "Sale item not found"));
    };
    let remaining = sold_quantity - returned_quantity;
    if return_quantity > remaining {
        return Ok(error(400, "Return quantity exceeds sold quantity"));
    }
    let refund_amount = if sold_quantity > 0.0 {
        total_price * (return_quantity / sold_quantity)
    } else {
        0.0
    };
    tx.execute(
        "UPDATE sale_items SET returned_quantity = returned_quantity + ?1 WHERE id = ?2",
        params![return_quantity, sale_item_id],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "UPDATE products
         SET quantity = quantity + ?1,
             status = CASE
                WHEN quantity + ?1 <= 0 THEN 'ended'
                WHEN quantity + ?1 <= min_quantity THEN 'few'
                ELSE 'available'
             END
         WHERE id = ?2",
        params![return_quantity, product_id],
    )
    .map_err(|err| err.to_string())?;
    restore_returned_stock_batches(
        &tx,
        sale_item_id,
        product_id,
        sold_quantity,
        return_quantity,
    )?;
    tx.execute(
        "INSERT INTO returns (sale_id, sale_item_id, product_id, quantity, amount, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![sale_id, sale_item_id, product_id, return_quantity, refund_amount, reason, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO stock_movements (product_id, sale_id, movement_type, quantity, reason, created_at)
         VALUES (?1, ?2, 'return', ?3, ?4, ?5)",
        params![product_id, sale_id, return_quantity, reason, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    if let Some(id) = debtor_id {
        tx.execute(
            "UPDATE debtors SET price = MAX(price - ?1, 0) WHERE id = ?2",
            params![refund_amount, id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(json!({
        "message": "Return saved successfully",
        "product_name": product_name,
        "quantity": return_quantity,
        "refund_amount": refund_amount
    })))
}

fn get_debtors_debts(
    conn: &Connection,
    market: &MarketSession,
    debtor_id: i64,
) -> Result<ApiResponse, String> {
    let debtor = debtor_json(conn, market.id, debtor_id)?;
    let debts = product_updates_json(conn, None, Some(debtor_id), None)?;
    let payments = debtor_payments_json(conn, market.id, debtor_id)?;
    Ok(ok(
        json!({"debtor": debtor, "debts": debts, "payments": payments}),
    ))
}

fn debtor_payment(
    conn: &Connection,
    market: &MarketSession,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let debtor_id = integer(body, "debtor_id");
    let amount = number(body, "amount");
    let method = text_default(body, "method", "cash");
    let note = text(body, "note");
    if amount <= 0.0 {
        return Ok(error(400, "Payment amount must be positive"));
    }
    let current = tx
        .query_row(
            "SELECT price FROM debtors WHERE id = ?1 AND market_id = ?2",
            params![debtor_id, market.id],
            |row| row.get::<_, f64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    let Some(balance) = current else {
        return Ok(error(404, "Debtor not found"));
    };
    let applied = amount.min(balance);
    tx.execute(
        "INSERT INTO debtor_payments (debtor_id, amount, method, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![debtor_id, applied, method, note, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "UPDATE debtors SET price = MAX(price - ?1, 0) WHERE id = ?2",
        params![applied, debtor_id],
    )
    .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(
        json!({"message": "Payment saved successfully", "amount": applied}),
    ))
}

fn delete_debt(
    conn: &Connection,
    market: &MarketSession,
    debt_id: i64,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let debt = tx
        .query_row(
            "SELECT u.debtor_id, u.price
             FROM product_updates u
             JOIN debtors d ON d.id = u.debtor_id
             WHERE u.id = ?1 AND d.market_id = ?2",
            params![debt_id, market.id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, f64>(1)?)),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if let Some((Some(debtor_id), price)) = debt {
        tx.execute(
            "UPDATE product_updates SET debtor_id = NULL WHERE id = ?1",
            params![debt_id],
        )
        .map_err(|err| err.to_string())?;
        tx.execute(
            "UPDATE debtors SET price = price - ?1 WHERE id = ?2",
            params![price, debtor_id],
        )
        .map_err(|err| err.to_string())?;
        tx.execute(
            "DELETE FROM debtors WHERE id = ?1 AND price <= 0",
            params![debtor_id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(json!({"message": "Debt deleted successfully"})))
}

fn expenses(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let prefix = current_month_prefix();
    ok_result(json!(expenses_json(conn, market.id, Some(&prefix))?))
}

fn expenses_json(
    conn: &Connection,
    market_id: i64,
    month_prefix: Option<&str>,
) -> Result<Vec<Value>, String> {
    let (sql, pattern) = if let Some(prefix) = month_prefix {
        (
            "SELECT id, market_id, type, price, date FROM expenses WHERE market_id = ?1 AND date LIKE ?2 ORDER BY date DESC",
            format!("{prefix}%"),
        )
    } else {
        (
            "SELECT id, market_id, type, price, date FROM expenses WHERE market_id = ?1 AND date LIKE ?2 ORDER BY date DESC",
            "%".to_string(),
        )
    };
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id, pattern], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "market_id": row.get::<_, i64>(1)?,
                "type": row.get::<_, String>(2)?,
                "price": row.get::<_, f64>(3)?,
                "date": row.get::<_, String>(4)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn history(conn: &Connection, market: &MarketSession) -> Result<ApiResponse, String> {
    let ids = product_ids(conn, market.id)?;
    let updates = product_updates_for_ids_json(conn, &ids, "subed")?;
    Ok(ok(json!(updates)))
}

fn history_delete(
    conn: &Connection,
    market: &MarketSession,
    update_id: i64,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let update = tx
        .query_row(
            "SELECT u.product_id, u.quantity, u.price, u.debtor_id
             FROM product_updates u
             JOIN products p ON p.id = u.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE u.id = ?1 AND c.market_id = ?2",
            params![update_id, market.id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
    if let Some((product_id, quantity, price, debtor_id)) = update {
        tx.execute(
            "UPDATE products SET quantity = quantity + ?1 WHERE id = ?2",
            params![quantity, product_id],
        )
        .map_err(|err| err.to_string())?;
        if let Some(id) = debtor_id {
            tx.execute(
                "UPDATE debtors SET price = price - ?1 WHERE id = ?2",
                params![price, id],
            )
            .map_err(|err| err.to_string())?;
        }
        tx.execute(
            "DELETE FROM product_updates WHERE id = ?1",
            params![update_id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(json!({"message": "History deleted successfully"})))
}

fn history_update(
    conn: &Connection,
    market: &MarketSession,
    update_id: i64,
    body: &Value,
) -> Result<ApiResponse, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    let old = tx
        .query_row(
            "SELECT u.product_id, u.quantity, u.price, u.debtor_id
             FROM product_updates u
             JOIN products p ON p.id = u.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE u.id = ?1 AND c.market_id = ?2",
            params![update_id, market.id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            },
        )
        .map_err(|err| err.to_string())?;
    let (product_id, old_quantity, old_price, debtor_id) = old;
    let new_quantity = number(body, "quantity");
    let new_price = number(body, "price");
    tx.execute(
        "UPDATE products SET quantity = quantity + ?1 - ?2 WHERE id = ?3",
        params![old_quantity, new_quantity, product_id],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "UPDATE product_updates SET quantity = ?1, price = ?2 WHERE id = ?3",
        params![new_quantity, new_price, update_id],
    )
    .map_err(|err| err.to_string())?;
    if let Some(id) = debtor_id {
        tx.execute(
            "UPDATE debtors SET price = price - ?1 + ?2 WHERE id = ?3",
            params![old_price, new_price, id],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;
    Ok(ok(json!({"message": "History updated successfully"})))
}

fn categories_with_products(
    conn: &Connection,
    market: &MarketSession,
) -> Result<ApiResponse, String> {
    let categories = categories_json(conn, market.id)?;
    let mut result = serde_json::Map::new();
    for category in categories {
        let id = category["id"].as_i64().unwrap_or(0);
        let name = category["name"].as_str().unwrap_or("").to_string();
        result.insert(name, json!(products_for_category_json(conn, id)?));
    }
    Ok(ok(Value::Object(result)))
}

fn products_json(
    conn: &Connection,
    market_id: i64,
    order: Option<&str>,
) -> Result<Vec<Value>, String> {
    let category_ids = category_ids(conn, market_id)?;
    if category_ids.is_empty() {
        return Ok(vec![]);
    }
    let mut products = Vec::new();
    for category_id in category_ids {
        products.extend(products_for_category_json(conn, category_id)?);
    }

    match order {
        Some("sells") => products.sort_by(|a, b| {
            b["total_subtracted"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&a["total_subtracted"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        Some("price") => products.sort_by(|a, b| {
            b["total_sold_price"]
                .as_f64()
                .unwrap_or(0.0)
                .partial_cmp(&a["total_sold_price"].as_f64().unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
        _ => {}
    }
    Ok(products)
}

fn products_for_category_json(conn: &Connection, category_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, c.name, p.name, p.quantity, p.min_quantity, p.quantity_type,
                    p.price_per_quantity, p.cost_per_quantity, p.image, p.status, p.date,
                    COALESCE(SUM(CASE WHEN u.status = 'subed' THEN u.quantity ELSE 0 END), 0) AS total_subtracted,
                    COALESCE(SUM(CASE WHEN u.status = 'subed' THEN u.price ELSE 0 END), 0) AS total_sold_price,
                    COALESCE((SELECT GROUP_CONCAT(b.number, '|') FROM barcodes b WHERE b.product_id = p.id), '') AS barcodes,
                    (SELECT MIN(sb.expiry_date) FROM stock_batches sb WHERE sb.product_id = p.id AND sb.quantity > 0 AND sb.expiry_date <> '') AS nearest_expiry_date
             FROM products p
             JOIN categories c ON c.id = p.category_id
             LEFT JOIN product_updates u ON u.product_id = p.id
             WHERE p.category_id = ?1
             GROUP BY p.id
             ORDER BY p.id DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![category_id], product_from_row)
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn product_json(conn: &Connection, market_id: i64, product_id: i64) -> Result<Value, String> {
    conn.query_row(
        "SELECT p.id, c.name, p.name, p.quantity, p.min_quantity, p.quantity_type,
                p.price_per_quantity, p.cost_per_quantity, p.image, p.status, p.date,
                COALESCE(SUM(CASE WHEN u.status = 'subed' THEN u.quantity ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN u.status = 'subed' THEN u.price ELSE 0 END), 0),
                COALESCE((SELECT GROUP_CONCAT(b.number, '|') FROM barcodes b WHERE b.product_id = p.id), ''),
                (SELECT MIN(sb.expiry_date) FROM stock_batches sb WHERE sb.product_id = p.id AND sb.quantity > 0 AND sb.expiry_date <> '')
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN product_updates u ON u.product_id = p.id
         WHERE p.id = ?1 AND c.market_id = ?2
         GROUP BY p.id",
        params![product_id, market_id],
        product_from_row,
    )
    .map_err(|err| err.to_string())
}

fn product_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let barcodes = row
        .get::<_, String>(13)?
        .split('|')
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "category_name": row.get::<_, String>(1)?,
        "name": row.get::<_, String>(2)?,
        "quantity": row.get::<_, f64>(3)?,
        "min_quantity": row.get::<_, f64>(4)?,
        "quantity_type": row.get::<_, String>(5)?,
        "price_per_quantity": row.get::<_, f64>(6)?,
        "cost_per_quantity": row.get::<_, f64>(7)?,
        "image": row.get::<_, Option<String>>(8)?,
        "status": row.get::<_, String>(9)?,
        "date": row.get::<_, String>(10)?,
        "total_subtracted": row.get::<_, f64>(11)?,
        "total_sold_price": row.get::<_, f64>(12)?,
        "barcodes": barcodes,
        "nearest_expiry_date": row.get::<_, Option<String>>(14)?
    }))
}

fn categories_json(conn: &Connection, market_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, market_id, date FROM categories WHERE market_id = ?1 ORDER BY name",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "market_id": row.get::<_, i64>(2)?,
                "date": row.get::<_, String>(3)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn debtors_json(conn: &Connection, market_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, market_id, name, phone, price, date FROM debtors WHERE market_id = ?1 ORDER BY date DESC")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "market_id": row.get::<_, i64>(1)?,
                "name": row.get::<_, String>(2)?,
                "phone": row.get::<_, String>(3)?,
                "price": row.get::<_, f64>(4)?,
                "date": row.get::<_, String>(5)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn debtor_json(conn: &Connection, market_id: i64, debtor_id: i64) -> Result<Value, String> {
    conn.query_row(
        "SELECT id, market_id, name, phone, price, date FROM debtors WHERE id = ?1 AND market_id = ?2",
        params![debtor_id, market_id],
        |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "market_id": row.get::<_, i64>(1)?,
                "name": row.get::<_, String>(2)?,
                "phone": row.get::<_, String>(3)?,
                "price": row.get::<_, f64>(4)?,
                "date": row.get::<_, String>(5)?
            }))
        },
    )
    .map_err(|err| err.to_string())
}

fn debtor_payments_json(
    conn: &Connection,
    market_id: i64,
    debtor_id: i64,
) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT dp.id, dp.debtor_id, dp.amount, dp.method, dp.note, dp.created_at
             FROM debtor_payments dp
             JOIN debtors d ON d.id = dp.debtor_id
             WHERE dp.debtor_id = ?1 AND d.market_id = ?2
             ORDER BY dp.created_at DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![debtor_id, market_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "debtor_id": row.get::<_, i64>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "method": row.get::<_, String>(3)?,
                "note": row.get::<_, String>(4)?,
                "created_at": row.get::<_, String>(5)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn sale_json(conn: &Connection, market_id: i64, sale_id: i64) -> Result<Value, String> {
    let sale = conn
        .query_row(
            "SELECT s.id, s.market_id, s.cashier, s.receipt_number, s.subtotal, s.discount,
                    s.total, s.paid_amount, s.payment_method, s.debtor_id, s.created_at,
                    COALESCE(d.name, ''), COALESCE(d.phone, '')
             FROM sales s
             LEFT JOIN debtors d ON d.id = s.debtor_id
             WHERE s.id = ?1 AND s.market_id = ?2",
            params![sale_id, market_id],
            |row| {
                Ok(json!({
                    "id": row.get::<_, i64>(0)?,
                    "market": row.get::<_, i64>(1)?,
                    "cashier": row.get::<_, String>(2)?,
                    "receipt_number": row.get::<_, String>(3)?,
                    "subtotal": row.get::<_, f64>(4)?,
                    "discount": row.get::<_, f64>(5)?,
                    "total": row.get::<_, f64>(6)?,
                    "paid_amount": row.get::<_, f64>(7)?,
                    "payment_method": row.get::<_, String>(8)?,
                    "debtor": row.get::<_, Option<i64>>(9)?,
                    "created_at": row.get::<_, String>(10)?,
                    "debtor_name": row.get::<_, String>(11)?,
                    "debtor_phone": row.get::<_, String>(12)?
                }))
            },
        )
        .map_err(|err| err.to_string())?;
    let items = sale_items_json(conn, sale_id)?;
    let payments = sale_payments_json(conn, sale_id)?;
    let returns = sale_returns_json(conn, sale_id)?;
    Ok(json!({
        "id": sale["id"],
        "market": sale["market"],
        "cashier": sale["cashier"],
        "receipt_number": sale["receipt_number"],
        "subtotal": sale["subtotal"],
        "discount": sale["discount"],
        "total": sale["total"],
        "paid_amount": sale["paid_amount"],
        "payment_method": sale["payment_method"],
        "debtor": sale["debtor"],
        "debtor_name": sale["debtor_name"],
        "debtor_phone": sale["debtor_phone"],
        "created_at": sale["created_at"],
        "items": items,
        "payments": payments,
        "returns": returns
    }))
}

fn receipt_json(conn: &Connection, market_id: i64, sale_id: i64) -> Result<Value, String> {
    let sale = sale_json(conn, market_id, sale_id)?;
    let market = market_json(conn, market_id)?;
    let paid = sale["payments"]
        .as_array()
        .map(|payments| {
            payments
                .iter()
                .map(|payment| payment["amount"].as_f64().unwrap_or(0.0))
                .sum::<f64>()
        })
        .unwrap_or(0.0);
    let total = sale["total"].as_f64().unwrap_or(0.0);
    Ok(json!({
        "receipt_number": sale["receipt_number"],
        "market_name": market["market_name"],
        "market_phone": market["phone_number"],
        "date": sale["created_at"],
        "items": sale["items"],
        "subtotal": sale["subtotal"],
        "discount": sale["discount"],
        "total": total,
        "paid_amount": paid,
        "unpaid_amount": (total - paid).max(0.0),
        "payment_method": sale["payment_method"],
        "payments": sale["payments"],
        "debtor": {
            "id": sale["debtor"],
            "name": sale["debtor_name"],
            "phone": sale["debtor_phone"]
        }
    }))
}

fn sale_items_json(conn: &Connection, sale_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT si.id, si.sale_id, si.product_id, p.name, si.quantity, si.unit_price,
                    si.discount, si.cost_at_sale, si.total_price, si.returned_quantity,
                    si.created_at, p.cost_per_quantity
             FROM sale_items si
             JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = ?1
             ORDER BY si.id",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "sale": row.get::<_, i64>(1)?,
                "product": row.get::<_, i64>(2)?,
                "product_name": row.get::<_, String>(3)?,
                "quantity": row.get::<_, f64>(4)?,
                "unit_price": row.get::<_, f64>(5)?,
                "discount": row.get::<_, f64>(6)?,
                "cost_at_sale": row.get::<_, f64>(7)?,
                "total_price": row.get::<_, f64>(8)?,
                "returned_quantity": row.get::<_, f64>(9)?,
                "created_at": row.get::<_, String>(10)?,
                "current_cost_per_quantity": row.get::<_, f64>(11)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn sale_payments_json(conn: &Connection, sale_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, sale_id, method, amount, created_at FROM payments WHERE sale_id = ?1 ORDER BY id")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "sale": row.get::<_, i64>(1)?,
                "method": row.get::<_, String>(2)?,
                "amount": row.get::<_, f64>(3)?,
                "created_at": row.get::<_, String>(4)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn sale_returns_json(conn: &Connection, sale_id: i64) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, sale_item_id, product_id, quantity, amount, reason, created_at FROM returns WHERE sale_id = ?1 ORDER BY id")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "sale_item_id": row.get::<_, i64>(1)?,
                "product_id": row.get::<_, i64>(2)?,
                "quantity": row.get::<_, f64>(3)?,
                "amount": row.get::<_, f64>(4)?,
                "reason": row.get::<_, String>(5)?,
                "created_at": row.get::<_, String>(6)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn product_updates_json(
    conn: &Connection,
    product_id: Option<i64>,
    debtor_id: Option<i64>,
    status: Option<&str>,
) -> Result<Vec<Value>, String> {
    let sql = match (product_id, debtor_id, status) {
        (Some(_), _, Some(_)) => "SELECT u.id, u.product_id, p.name, u.status, u.quantity, u.price, u.debtor_id, u.date FROM product_updates u JOIN products p ON p.id = u.product_id WHERE u.product_id = ?1 AND u.status = ?2 ORDER BY u.date DESC",
        (_, Some(_), _) => "SELECT u.id, u.product_id, p.name, u.status, u.quantity, u.price, u.debtor_id, u.date FROM product_updates u JOIN products p ON p.id = u.product_id WHERE u.debtor_id = ?1 ORDER BY u.date DESC",
        (Some(_), _, _) => "SELECT u.id, u.product_id, p.name, u.status, u.quantity, u.price, u.debtor_id, u.date FROM product_updates u JOIN products p ON p.id = u.product_id WHERE u.product_id = ?1 ORDER BY u.date DESC",
        _ => "SELECT u.id, u.product_id, p.name, u.status, u.quantity, u.price, u.debtor_id, u.date FROM product_updates u JOIN products p ON p.id = u.product_id ORDER BY u.date DESC",
    };
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let mapper = |row: &rusqlite::Row<'_>| {
        Ok(json!({
            "id": row.get::<_, i64>(0)?,
            "product_id": row.get::<_, i64>(1)?,
            "product_name": row.get::<_, String>(2)?,
            "status": row.get::<_, String>(3)?,
            "quantity": row.get::<_, f64>(4)?,
            "price": row.get::<_, f64>(5)?,
            "debtor": row.get::<_, Option<i64>>(6)?,
            "date": row.get::<_, String>(7)?
        }))
    };

    match (product_id, debtor_id, status) {
        (Some(pid), _, Some(st)) => collect_vec(
            stmt.query_map(params![pid, st], mapper)
                .map_err(|err| err.to_string())?,
        ),
        (_, Some(did), _) => collect_vec(
            stmt.query_map(params![did], mapper)
                .map_err(|err| err.to_string())?,
        ),
        (Some(pid), _, _) => collect_vec(
            stmt.query_map(params![pid], mapper)
                .map_err(|err| err.to_string())?,
        ),
        _ => collect_vec(stmt.query_map([], mapper).map_err(|err| err.to_string())?),
    }
}

fn product_update_json(
    conn: &Connection,
    market: &MarketSession,
    update_id: i64,
) -> Result<Value, String> {
    let mut updates = product_updates_json(conn, None, None, None)?;
    let update = updates
        .drain(..)
        .find(|update| {
            update["id"].as_i64() == Some(update_id)
                && update["product_id"]
                    .as_i64()
                    .map(|product_id| {
                        product_belongs_to_market(conn, product_id, market.id).unwrap_or(false)
                    })
                    .unwrap_or(false)
        })
        .ok_or_else(|| "Update not found".to_string())?;
    Ok(update)
}

fn product_updates_for_ids_json(
    conn: &Connection,
    ids: &[i64],
    status: &str,
) -> Result<Vec<Value>, String> {
    let mut result = Vec::new();
    for id in ids {
        result.extend(product_updates_json(conn, Some(*id), None, Some(status))?);
    }
    Ok(result)
}

fn market_json(conn: &Connection, id: i64) -> Result<Value, String> {
    conn.query_row(
        "SELECT id, phone_number, market_name, profile_picture, plan FROM markets WHERE id = ?1",
        params![id],
        |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "phone_number": row.get::<_, String>(1)?,
                "market_name": row.get::<_, String>(2)?,
                "profile_picture": row.get::<_, Option<String>>(3)?,
                "plan": row.get::<_, String>(4)?
            }))
        },
    )
    .map_err(|err| err.to_string())
}

fn authenticate(conn: &Connection, headers: Option<&Value>) -> Result<MarketSession, String> {
    let authorization = headers
        .and_then(|h| h.get("authorization").or_else(|| h.get("Authorization")))
        .and_then(Value::as_str)
        .unwrap_or("");
    let token = authorization
        .strip_prefix("Token ")
        .or_else(|| authorization.strip_prefix("Bearer "))
        .unwrap_or(authorization)
        .trim();

    if token.is_empty() {
        return Err("Missing auth token".to_string());
    }

    conn.query_row(
        "SELECT id FROM markets WHERE token = ?1",
        params![token],
        |row| Ok(MarketSession { id: row.get(0)? }),
    )
    .optional()
    .map_err(|err| err.to_string())?
    .ok_or_else(|| "Invalid auth token".to_string())
}

fn open_connection(db_path: &PathBuf) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
    conn.busy_timeout(std::time::Duration::from_millis(2500))
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data folder: {err}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|err| format!("Could not create app data folder: {err}"))?;

    Ok(app_data_dir.join(DATABASE_FILE_NAME))
}

fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "temp_store", "MEMORY")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS markets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT NOT NULL UNIQUE,
            market_name TEXT NOT NULL,
            profile_picture TEXT,
            plan TEXT NOT NULL DEFAULT '',
            password TEXT NOT NULL DEFAULT '',
            token TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS debtors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            price REAL NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            quantity REAL NOT NULL,
            min_quantity REAL NOT NULL DEFAULT 50,
            quantity_type TEXT NOT NULL DEFAULT 'dona',
            price_per_quantity REAL NOT NULL,
            cost_per_quantity REAL NOT NULL DEFAULT 0,
            image TEXT,
            status TEXT NOT NULL DEFAULT 'ended',
            date TEXT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS barcodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            number TEXT NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scanner_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            barcode TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'phone',
            created_at TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scanner_clients (
            market_id INTEGER PRIMARY KEY NOT NULL,
            last_seen_at INTEGER NOT NULL,
            device_name TEXT NOT NULL DEFAULT 'phone',
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS product_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'subed',
            quantity REAL NOT NULL,
            price REAL NOT NULL,
            debtor_id INTEGER,
            sale_item_id INTEGER,
            date TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE SET NULL,
            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            cashier TEXT NOT NULL DEFAULT '',
            receipt_number TEXT NOT NULL,
            subtotal REAL NOT NULL DEFAULT 0,
            discount REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            paid_amount REAL NOT NULL DEFAULT 0,
            payment_method TEXT NOT NULL DEFAULT 'cash',
            debtor_id INTEGER,
            created_at TEXT NOT NULL,
            UNIQUE(market_id, receipt_number),
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
            FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            unit_price REAL NOT NULL,
            discount REAL NOT NULL DEFAULT 0,
            cost_at_sale REAL NOT NULL DEFAULT 0,
            total_price REAL NOT NULL,
            returned_quantity REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS sale_item_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_item_id INTEGER NOT NULL,
            stock_batch_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            cost_per_quantity REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
            FOREIGN KEY (stock_batch_id) REFERENCES stock_batches(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            amount REAL NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            sale_id INTEGER,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            type TEXT NOT NULL DEFAULT 'salary',
            price REAL NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            sale_item_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            amount REAL NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS debtor_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            debtor_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT NOT NULL DEFAULT 'cash',
            note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(market_id, name, phone),
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS purchase_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            supplier_id INTEGER NOT NULL,
            invoice_number TEXT NOT NULL,
            total REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            unit_cost REAL NOT NULL,
            total REAL NOT NULL,
            expiry_date TEXT,
            batch_number TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            old_quantity REAL NOT NULL,
            new_quantity REAL NOT NULL,
            difference REAL NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS stock_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            batch_number TEXT NOT NULL DEFAULT '',
            expiry_date TEXT NOT NULL,
            quantity REAL NOT NULL,
            cost_per_quantity REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_categories_market_id ON categories(market_id);
        CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
        CREATE INDEX IF NOT EXISTS idx_product_updates_product_id ON product_updates(product_id);
        CREATE INDEX IF NOT EXISTS idx_product_updates_debtor_id ON product_updates(debtor_id);
        CREATE INDEX IF NOT EXISTS idx_sales_market_id ON sales(market_id);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
        CREATE INDEX IF NOT EXISTS idx_sale_item_batches_sale_item_id ON sale_item_batches(sale_item_id);
        CREATE INDEX IF NOT EXISTS idx_sale_item_batches_stock_batch_id ON sale_item_batches(stock_batch_id);
        CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments(sale_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
        CREATE INDEX IF NOT EXISTS idx_debtors_market_id ON debtors(market_id);
        CREATE INDEX IF NOT EXISTS idx_expenses_market_id ON expenses(market_id);
        CREATE INDEX IF NOT EXISTS idx_barcodes_number ON barcodes(number);
        CREATE INDEX IF NOT EXISTS idx_scanner_events_market_id ON scanner_events(market_id);
        CREATE INDEX IF NOT EXISTS idx_scanner_clients_last_seen_at ON scanner_clients(last_seen_at);
        CREATE INDEX IF NOT EXISTS idx_returns_sale_item_id ON returns(sale_item_id);
        CREATE INDEX IF NOT EXISTS idx_debtor_payments_debtor_id ON debtor_payments(debtor_id);
        CREATE INDEX IF NOT EXISTS idx_suppliers_market_id ON suppliers(market_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_invoices_market_id ON purchase_invoices(market_id);
        CREATE INDEX IF NOT EXISTS idx_stock_batches_product_id ON stock_batches(product_id);
        ",
    )?;

    add_column_if_missing(conn, "markets", "password", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "markets", "token", "TEXT")?;
    add_column_if_missing(conn, "products", "min_quantity", "REAL NOT NULL DEFAULT 50")?;
    add_column_if_missing(
        conn,
        "products",
        "cost_per_quantity",
        "REAL NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(conn, "product_updates", "sale_item_id", "INTEGER")?;
    add_column_if_missing(conn, "sale_items", "discount", "REAL NOT NULL DEFAULT 0")?;
    add_column_if_missing(
        conn,
        "sale_items",
        "returned_quantity",
        "REAL NOT NULL DEFAULT 0",
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_markets_token ON markets(token)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_updates_sale_item_id ON product_updates(sale_item_id)",
        [],
    )?;
    repair_divided_unit_costs(conn)?;
    repair_unit_purchase_totals(conn)?;
    repair_sale_item_costs(conn)?;
    bootstrap_missing_stock_batches(conn)?;

    let now = now_iso();
    conn.execute(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('created_at', ?1)",
        params![now],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?1)",
        params![CURRENT_SCHEMA_VERSION.to_string()],
    )?;

    Ok(())
}

fn import_legacy_database_if_empty(
    app: &tauri::AppHandle,
    conn: &Connection,
) -> rusqlite::Result<()> {
    let legacy_imported = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'legacy_imported'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .is_some();
    if legacy_imported {
        return Ok(());
    }

    let product_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM products", [], |row| row.get(0))?;
    let category_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    let debtor_count: i64 = conn.query_row("SELECT COUNT(*) FROM debtors", [], |row| row.get(0))?;

    if product_count > 0 && category_count > 0 && debtor_count > 0 {
        conn.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('legacy_imported', ?1)",
            params![now_iso()],
        )?;
        return Ok(());
    }

    let Some(legacy_path) = find_legacy_database(app) else {
        return Ok(());
    };

    let legacy = legacy_path.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("ATTACH DATABASE '{legacy}' AS legacy;"))?;

    let import_result = conn.execute_batch(
        "
        INSERT OR IGNORE INTO markets (
            id, phone_number, market_name, profile_picture, plan, password, token, created_at
        )
        SELECT
            m.id,
            m.phone_number,
            m.market_name,
            NULLIF(m.profile_picture, ''),
            COALESCE(m.plan, ''),
            COALESCE(m.password, ''),
            (
                SELECT t.key
                FROM legacy.markets_customtoken t
                WHERE t.market_id = m.id
                ORDER BY t.created DESC
                LIMIT 1
            ),
            COALESCE(m.created_at, datetime('now'))
        FROM legacy.markets_market m;

        UPDATE markets
        SET
            market_name = COALESCE((SELECT m.market_name FROM legacy.markets_market m WHERE m.id = markets.id), market_name),
            profile_picture = COALESCE(NULLIF((SELECT m.profile_picture FROM legacy.markets_market m WHERE m.id = markets.id), ''), profile_picture),
            plan = COALESCE((SELECT m.plan FROM legacy.markets_market m WHERE m.id = markets.id), plan),
            password = COALESCE(NULLIF((SELECT m.password FROM legacy.markets_market m WHERE m.id = markets.id), ''), password),
            token = COALESCE(
                (
                    SELECT t.key
                    FROM legacy.markets_customtoken t
                    WHERE t.market_id = markets.id
                    ORDER BY t.created DESC
                    LIMIT 1
                ),
                token
            )
        WHERE EXISTS (SELECT 1 FROM legacy.markets_market m WHERE m.id = markets.id);

        INSERT OR IGNORE INTO categories (id, market_id, name, date)
        SELECT id, market_id_id, name, COALESCE(date, datetime('now'))
        FROM legacy.products_category;

        INSERT OR IGNORE INTO debtors (id, market_id, name, phone, price, date)
        SELECT id, market_id_id, name, phone, COALESCE(price, 0), COALESCE(date, datetime('now'))
        FROM legacy.reports_debtor;

        INSERT OR IGNORE INTO products (
            id, category_id, name, quantity, min_quantity, quantity_type, price_per_quantity, cost_per_quantity, image, status, date
        )
        SELECT
            id,
            category_id_id,
            name,
            COALESCE(quantity, 0),
            50,
            COALESCE(quantity_type, 'dona'),
            COALESCE(price_per_quantity, 0),
            0,
            NULLIF(image, ''),
            COALESCE(status, 'ended'),
            COALESCE(date, datetime('now'))
        FROM legacy.products_product;

        INSERT OR IGNORE INTO product_updates (
            id, product_id, status, quantity, price, debtor_id, date
        )
        SELECT
            id,
            product_id_id,
            COALESCE(status, 'subed'),
            COALESCE(quantity, 0),
            COALESCE(price, 0),
            debtor_id,
            COALESCE(date, datetime('now'))
        FROM legacy.products_productupdate;

        INSERT OR IGNORE INTO expenses (id, market_id, type, price, date)
        SELECT
            id,
            market_id_id,
            COALESCE(type, 'other'),
            COALESCE(price, 0),
            COALESCE(date, datetime('now'))
        FROM legacy.reports_expense;
        ",
    );

    let detach_result = conn.execute_batch("DETACH DATABASE legacy;");
    let result = import_result.and(detach_result);
    if result.is_ok() {
        conn.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('legacy_imported', ?1)",
            params![now_iso()],
        )?;
    }
    result
}

fn default_desktop_session(conn: &Connection) -> Result<Option<Value>, String> {
    let row = conn
        .query_row(
            "
            SELECT m.id, m.token
            FROM markets m
            LEFT JOIN categories c ON c.market_id = m.id
            LEFT JOIN products p ON p.category_id = c.id
            WHERE m.token IS NOT NULL AND m.token != ''
            GROUP BY m.id
            ORDER BY COUNT(p.id) DESC, m.id DESC
            LIMIT 1
            ",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    let Some((market_id, token)) = row else {
        return Ok(None);
    };

    Ok(Some(json!({
        "token": token,
        "market": market_json(conn, market_id)?
    })))
}

fn ensure_scanner_server(db_path: PathBuf) -> Result<ScannerServerInfo, String> {
    if let Some(info) = SCANNER_SERVER.get() {
        return Ok(info.clone());
    }

    let mut listener_and_port = None;
    for port in 3434..=3444 {
        if let Ok(listener) = TcpListener::bind(("0.0.0.0", port)) {
            listener_and_port = Some((listener, port));
            break;
        }
    }

    let (listener, port) = listener_and_port
        .ok_or_else(|| "Could not start phone scanner server on ports 3434-3444".to_string())?;
    let host = local_network_host().unwrap_or_else(|| "127.0.0.1".to_string());
    let info = ScannerServerInfo {
        host: host.clone(),
        port,
        base_url: format!("http://{host}:{port}"),
    };

    let thread_db_path = db_path.clone();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let db_path = thread_db_path.clone();
            thread::spawn(move || {
                let _ = handle_scanner_http(stream, db_path);
            });
        }
    });

    let _ = SCANNER_SERVER.set(info.clone());
    Ok(SCANNER_SERVER.get().cloned().unwrap_or(info))
}

fn local_network_host() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

fn handle_scanner_http(mut stream: TcpStream, db_path: PathBuf) -> Result<(), String> {
    let mut buffer = [0_u8; 65536];
    let size = stream.read(&mut buffer).map_err(|err| err.to_string())?;
    if size == 0 {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buffer[..size]).to_string();
    let mut parts = request.split("\r\n\r\n");
    let head = parts.next().unwrap_or("");
    let body = parts.next().unwrap_or("");
    let mut first_line = head.lines().next().unwrap_or("").split_whitespace();
    let method = first_line.next().unwrap_or("");
    let target = first_line.next().unwrap_or("/");

    let response = match (method, target.split('?').next().unwrap_or(target)) {
        ("OPTIONS", _) => http_response(204, "application/json", ""),
        ("GET", "/") => http_response(200, "text/html; charset=utf-8", scanner_page_html()),
        ("GET", "/scanner") => http_response(200, "text/html; charset=utf-8", scanner_page_html()),
        ("GET", "/zxing-browser.min.js") => http_response(
            200,
            "application/javascript; charset=utf-8",
            zxing_browser_js(),
        ),
        ("GET", "/health") => http_response(200, "application/json", r#"{"ok":true}"#),
        ("POST", "/api/scanner/scan") => handle_scanner_scan(&db_path, target, body),
        ("POST", "/api/scanner/ping") => handle_scanner_ping(&db_path, target, body),
        _ => http_response(404, "application/json", r#"{"error":"Not found"}"#),
    };

    stream
        .write_all(response.as_bytes())
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn scanner_market_id(conn: &Connection, target: &str, body: &str) -> Result<i64, String> {
    let payload = serde_json::from_str::<Value>(body).unwrap_or_else(|_| json!({}));
    let token = payload
        .get("token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| query_param(target, "token"))
        .ok_or_else(|| "Missing token".to_string())?;

    conn.query_row(
        "SELECT id FROM markets WHERE token = ?1",
        params![token],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map_err(|err| err.to_string())?
    .ok_or_else(|| "Invalid token".to_string())
}

fn handle_scanner_ping(db_path: &PathBuf, target: &str, body: &str) -> String {
    let result = (|| -> Result<(), String> {
        let conn = open_connection(db_path)?;
        let market_id = scanner_market_id(&conn, target, body)?;
        conn.execute(
            "INSERT INTO scanner_clients (market_id, last_seen_at, device_name)
             VALUES (?1, ?2, 'phone')
             ON CONFLICT(market_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, device_name = excluded.device_name",
            params![market_id, OffsetDateTime::now_utc().unix_timestamp()],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })();

    match result {
        Ok(_) => http_response(200, "application/json", r#"{"ok":true}"#),
        Err(message) => {
            let body = json!({"error": message}).to_string();
            http_response(400, "application/json", &body)
        }
    }
}

fn handle_scanner_scan(db_path: &PathBuf, target: &str, body: &str) -> String {
    let payload = serde_json::from_str::<Value>(body).unwrap_or_else(|_| json!({}));
    let barcode = payload
        .get("barcode")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");

    if barcode.is_empty() {
        return http_response(
            400,
            "application/json",
            r#"{"error":"Barcode is required"}"#,
        );
    }

    let result = (|| -> Result<(), String> {
        let conn = open_connection(db_path)?;
        let market_id = scanner_market_id(&conn, target, body)?;

        conn.execute(
            "INSERT INTO scanner_events (market_id, barcode, source, created_at) VALUES (?1, ?2, 'phone', ?3)",
            params![market_id, barcode, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })();

    match result {
        Ok(_) => http_response(200, "application/json", r#"{"ok":true}"#),
        Err(message) => {
            let body = json!({"error": message}).to_string();
            http_response(400, "application/json", &body)
        }
    }
}

fn query_param(target: &str, key: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    query.split('&').find_map(|part| {
        let (name, value) = part.split_once('=')?;
        if name == key && !value.trim().is_empty() {
            Some(value.trim().to_string())
        } else {
            None
        }
    })
}

fn http_response(status: u16, content_type: &str, body: &str) -> String {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        _ => "OK",
    };
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    )
}

fn scanner_page_html() -> &'static str {
    r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SStore Phone Scanner</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #071821; color: #f8fafc; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; padding: 18px; }
    main { width: min(520px, 100%); }
    h1 { margin: 0 0 8px; font-size: 26px; }
    p { color: #a7b6c2; line-height: 1.45; }
    video { width: 100%; aspect-ratio: 4 / 3; background: #000; border: 1px solid #244754; border-radius: 14px; object-fit: cover; }
    .panel { background: #0c2530; border: 1px solid #244754; border-radius: 14px; padding: 14px; margin-top: 14px; }
    .row { display: flex; gap: 10px; margin-top: 10px; }
    .stack { display: grid; gap: 10px; margin-top: 10px; }
    input { flex: 1; min-width: 0; border: 1px solid #4c7273; border-radius: 10px; background: #071821; color: #fff; padding: 12px; font-size: 16px; }
    input[type=file] { display: none; }
    button { border: 0; border-radius: 10px; background: #4c7273; color: #fff; padding: 12px 14px; font-weight: 800; font-size: 15px; }
    label.button { display: block; text-align: center; border-radius: 10px; background: #2563eb; color: #fff; padding: 13px 14px; font-weight: 800; font-size: 15px; }
    #status { min-height: 22px; margin-top: 10px; font-weight: 700; color: #a7f3d0; }
    .bad { color: #fecaca !important; }
  </style>
</head>
<body>
  <main>
    <h1>SStore Scanner</h1>
    <p>Point the phone camera at a product barcode. The product will be sent to the Sell page cart.</p>
    <video id="video" playsinline muted></video>
    <div class="panel">
      <div class="stack">
        <label class="button" for="photo">Scan with phone camera</label>
        <input id="photo" type="file" accept="image/*" capture="environment">
      </div>
      <p>This button works even when the browser blocks live camera access on local Wi-Fi HTTP pages.</p>
      <div>Manual barcode</div>
      <div class="row">
        <input id="manual" inputmode="numeric" autocomplete="off" placeholder="Barcode number">
        <button id="send">Send</button>
      </div>
      <div id="status">Starting camera...</div>
    </div>
  </main>
  <script src="/zxing-browser.min.js"></script>
  <script>
    const token = new URLSearchParams(location.search).get("token") || "";
    const video = document.getElementById("video");
    const statusEl = document.getElementById("status");
    const manual = document.getElementById("manual");
    const sendBtn = document.getElementById("send");
    const photoInput = document.getElementById("photo");
    const zxingReader = window.ZXingBrowser
      ? new ZXingBrowser.BrowserMultiFormatReader()
      : null;
    let lastCode = "";
    let lastAt = 0;

    function setStatus(message, bad) {
      statusEl.textContent = message;
      statusEl.className = bad ? "bad" : "";
    }

    async function sendBarcode(barcode) {
      const code = String(barcode || "").trim();
      if (!code || !token) return;
      const now = Date.now();
      if (code === lastCode && now - lastAt < 1800) return;
      lastCode = code;
      lastAt = now;
      try {
        const response = await fetch("/api/scanner/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, barcode: code })
        });
        if (!response.ok) throw new Error("Could not send barcode");
        setStatus("Sent: " + code, false);
        manual.value = "";
        if (navigator.vibrate) navigator.vibrate(80);
      } catch (error) {
        setStatus(error.message || "Send failed", true);
      }
    }

    sendBtn.addEventListener("click", () => sendBarcode(manual.value));
    manual.addEventListener("keydown", (event) => {
      if (event.key === "Enter") sendBarcode(manual.value);
    });

    photoInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        setStatus("Decoding photo...", false);
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
          try {
            let value = "";
            if ("BarcodeDetector" in window) {
              const detector = new BarcodeDetector({
                formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"]
              });
              const codes = await detector.detect(img);
              value = codes[0] && codes[0].rawValue;
            }
            if (!value && zxingReader) {
              const result = await zxingReader.decodeFromImageElement(img);
              value = result && (result.getText ? result.getText() : result.text);
            }
            URL.revokeObjectURL(url);
            photoInput.value = "";
            if (!value) throw new Error("Barcode not found in photo");
            await sendBarcode(value);
          } catch (error) {
            URL.revokeObjectURL(url);
            photoInput.value = "";
            setStatus("Barcode not found. Try closer and keep it sharp.", true);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          photoInput.value = "";
          setStatus("Could not open photo.", true);
        };
        img.src = url;
      } catch (error) {
        setStatus(error.message || "Photo scan failed", true);
      }
    });

    async function pingDesktop() {
      if (!token) return;
      try {
        await fetch("/api/scanner/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
      } catch (_) {}
    }

    pingDesktop();
    setInterval(pingDesktop, 2500);

    async function startCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("Live camera is blocked on this HTTP Wi-Fi page. Tap Scan with phone camera.", true);
        return;
      }
      if (!("BarcodeDetector" in window)) {
        setStatus("Live barcode detection is not supported here. Tap Scan with phone camera.", true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"]
        });
        setStatus("Scanner ready", false);
        async function scan() {
          try {
            const codes = await detector.detect(video);
            if (codes.length) await sendBarcode(codes[0].rawValue);
          } catch (_) {}
          requestAnimationFrame(scan);
        }
        scan();
      } catch (error) {
        setStatus("Camera unavailable. Tap Scan with phone camera.", true);
      }
    }

    if (!token) {
      setStatus("Missing scanner token. Reopen this page from the QR code.", true);
    }
    startCamera();
  </script>
</body>
</html>"#
}

fn zxing_browser_js() -> &'static str {
    include_str!("../../node_modules/@zxing/browser/umd/zxing-browser.min.js")
}

fn repair_divided_unit_costs(conn: &Connection) -> rusqlite::Result<()> {
    let already_repaired = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'unit_cost_division_repaired'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .is_some();
    if already_repaired {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TEMP TABLE IF NOT EXISTS unit_cost_repairs (
            product_id INTEGER PRIMARY KEY,
            repaired_cost REAL NOT NULL
        );
        DELETE FROM unit_cost_repairs;

        INSERT INTO unit_cost_repairs (product_id, repaired_cost)
        SELECT p.id, u.price
        FROM products p
        JOIN product_updates u ON u.product_id = p.id
        WHERE u.id = (
            SELECT u2.id
            FROM product_updates u2
            WHERE u2.product_id = p.id
              AND u2.status = 'added'
              AND u2.quantity > 1
              AND u2.price > 0
            ORDER BY u2.date ASC, u2.id ASC
            LIMIT 1
        )
          AND p.cost_per_quantity > 0
          AND u.price > p.cost_per_quantity * 10
          AND ABS(p.cost_per_quantity - (u.price / u.quantity)) < 0.0001;

        UPDATE products
        SET cost_per_quantity = (
            SELECT repaired_cost
            FROM unit_cost_repairs
            WHERE product_id = products.id
        )
        WHERE id IN (SELECT product_id FROM unit_cost_repairs);

        UPDATE sale_items
        SET cost_at_sale = (
            SELECT repaired_cost
            FROM unit_cost_repairs
            WHERE product_id = sale_items.product_id
        )
        WHERE product_id IN (SELECT product_id FROM unit_cost_repairs)
          AND cost_at_sale > 0
          AND cost_at_sale * 10 < (
            SELECT repaired_cost
            FROM unit_cost_repairs
            WHERE product_id = sale_items.product_id
          );

        DROP TABLE unit_cost_repairs;
        ",
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('unit_cost_division_repaired', ?1)",
        params![now_iso()],
    )?;
    Ok(())
}

fn repair_unit_purchase_totals(conn: &Connection) -> rusqlite::Result<()> {
    let already_repaired = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'unit_purchase_totals_repaired'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .is_some();
    if already_repaired {
        return Ok(());
    }

    conn.execute_batch(
        "
        CREATE TEMP TABLE IF NOT EXISTS unit_purchase_total_repairs (
            update_id INTEGER PRIMARY KEY,
            repaired_total REAL NOT NULL
        );
        DELETE FROM unit_purchase_total_repairs;

        INSERT INTO unit_purchase_total_repairs (update_id, repaired_total)
        SELECT u.id, u.price * u.quantity
        FROM product_updates u
        JOIN products p ON p.id = u.product_id
        WHERE u.status = 'added'
          AND u.quantity > 1
          AND u.price > 0
          AND p.cost_per_quantity > 0
          AND ABS(u.price - p.cost_per_quantity) <= CASE
                WHEN p.cost_per_quantity * 0.001 > 0.01 THEN p.cost_per_quantity * 0.001
                ELSE 0.01
              END;

        UPDATE product_updates
        SET price = (
            SELECT repaired_total
            FROM unit_purchase_total_repairs
            WHERE update_id = product_updates.id
        )
        WHERE id IN (SELECT update_id FROM unit_purchase_total_repairs);

        DROP TABLE unit_purchase_total_repairs;
        ",
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('unit_purchase_totals_repaired', ?1)",
        params![now_iso()],
    )?;
    Ok(())
}

fn repair_sale_item_costs(conn: &Connection) -> rusqlite::Result<()> {
    let already_repaired = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'sale_item_costs_repaired'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .is_some();
    if already_repaired {
        return Ok(());
    }

    conn.execute(
        "UPDATE sale_items
         SET cost_at_sale = (
            SELECT p.cost_per_quantity
            FROM products p
            WHERE p.id = sale_items.product_id
         )
         WHERE EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = sale_items.product_id
              AND p.cost_per_quantity > 0
              AND (sale_items.cost_at_sale <= 0 OR sale_items.cost_at_sale * 10 < p.cost_per_quantity)
         )",
        [],
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sale_item_costs_repaired', ?1)",
        params![now_iso()],
    )?;
    Ok(())
}

fn bootstrap_missing_stock_batches(conn: &Connection) -> rusqlite::Result<()> {
    let already_bootstrapped = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = 'stock_batches_bootstrapped'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .is_some();
    if already_bootstrapped {
        return Ok(());
    }

    conn.execute_batch(
        "
        INSERT INTO stock_batches (product_id, batch_number, expiry_date, quantity, cost_per_quantity, created_at)
        SELECT p.id,
               'opening-stock',
               '',
               p.quantity - COALESCE((
                    SELECT SUM(sb.quantity)
                    FROM stock_batches sb
                    WHERE sb.product_id = p.id
               ), 0),
               p.cost_per_quantity,
               p.date
        FROM products p
        WHERE p.quantity > COALESCE((
                SELECT SUM(sb.quantity)
                FROM stock_batches sb
                WHERE sb.product_id = p.id
            ), 0)
          AND p.quantity > 0;
        ",
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('stock_batches_bootstrapped', ?1)",
        params![now_iso()],
    )?;
    Ok(())
}

fn find_legacy_database(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(path) = std::env::var("SSTORE_LEGACY_DB") {
        candidates.push(PathBuf::from(path));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("legacy-db.sqlite3"));
        candidates.push(current_dir.join("sstore-legacy.sqlite3"));
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("legacy-db.sqlite3"));
        candidates.push(resource_dir.join("sstore-legacy.sqlite3"));
    }

    candidates.into_iter().find(|path| path.exists())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )?;
    Ok(())
}

fn category_ids(conn: &Connection, market_id: i64) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM categories WHERE market_id = ?1")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id], |row| row.get::<_, i64>(0))
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn product_ids(conn: &Connection, market_id: i64) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id FROM products p JOIN categories c ON c.id = p.category_id WHERE c.market_id = ?1",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id], |row| row.get::<_, i64>(0))
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn category_belongs_to_market(
    conn: &Connection,
    category_id: i64,
    market_id: i64,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM categories WHERE id = ?1 AND market_id = ?2",
        params![category_id, market_id],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(|err| err.to_string())
}

fn product_belongs_to_market(
    conn: &Connection,
    product_id: i64,
    market_id: i64,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.id = ?1 AND c.market_id = ?2",
        params![product_id, market_id],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(|err| err.to_string())
}

fn month_profit(conn: &Connection, market_id: i64) -> Result<Vec<f64>, String> {
    let now = OffsetDateTime::now_utc();
    let mut values = Vec::new();
    for day in 1..=now.day() {
        let prefix = format!("{:04}-{:02}-{:02}", now.year(), u8::from(now.month()), day);
        let sales = sum_sales_until(conn, market_id, &prefix)?;
        let legacy_sells = sum_legacy_updates_until(conn, market_id, &prefix)?;
        let cogs = sum_cogs_until(conn, market_id, &prefix)?;
        let expenses = sum_expenses_until(conn, market_id, &prefix)?;
        values.push(sales + legacy_sells - cogs - expenses);
    }
    Ok(values)
}

fn month_income(conn: &Connection, market_id: i64) -> Result<f64, String> {
    let prefix = current_month_prefix();
    let sales: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales WHERE market_id = ?1 AND created_at LIKE ?2",
            params![market_id, format!("{prefix}%")],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|err| err.to_string())?;
    let legacy: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(u.price), 0)
             FROM product_updates u
             JOIN products p ON p.id = u.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE c.market_id = ?1 AND u.status = 'subed' AND u.sale_item_id IS NULL AND u.date LIKE ?2",
            params![market_id, format!("{prefix}%")],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|err| err.to_string())?;
    Ok(sales + legacy - month_returns(conn, market_id)?)
}

fn sum_update_quantities_market(
    conn: &Connection,
    market_id: i64,
    status: &str,
) -> Result<f64, String> {
    let prefix = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(u.quantity), 0)
         FROM product_updates u
         JOIN products p ON p.id = u.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE c.market_id = ?1 AND u.status = ?2 AND u.date LIKE ?3",
        params![market_id, status, format!("{prefix}%")],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn month_expenses(conn: &Connection, market_id: i64) -> Result<f64, String> {
    let prefix = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(price), 0) FROM expenses WHERE market_id = ?1 AND date LIKE ?2",
        params![market_id, format!("{prefix}%")],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn month_inventory_purchases(conn: &Connection, market_id: i64) -> Result<f64, String> {
    let prefix = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(u.price), 0)
         FROM product_updates u
         JOIN products p ON p.id = u.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE c.market_id = ?1
           AND u.status = 'added'
           AND u.price > 0
           AND u.date LIKE ?2",
        params![market_id, format!("{prefix}%")],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn sum_sales_until(conn: &Connection, market_id: i64, end_prefix: &str) -> Result<f64, String> {
    let month = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE((SELECT SUM(total)
                          FROM sales
                          WHERE market_id = ?1 AND created_at >= ?2 AND created_at <= ?3), 0)
                - COALESCE((SELECT SUM(r.amount)
                            FROM returns r
                            JOIN sales s ON s.id = r.sale_id
                            WHERE s.market_id = ?1 AND r.created_at >= ?2 AND r.created_at <= ?3), 0)",
        params![market_id, format!("{month}-01"), format!("{end_prefix}T23:59:59Z")],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn sum_legacy_updates_until(
    conn: &Connection,
    market_id: i64,
    end_prefix: &str,
) -> Result<f64, String> {
    let month = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(u.price), 0)
         FROM product_updates u
         JOIN products p ON p.id = u.product_id
         JOIN categories c ON c.id = p.category_id
         WHERE c.market_id = ?1 AND u.status = 'subed' AND u.sale_item_id IS NULL
           AND u.date >= ?2 AND u.date <= ?3",
        params![
            market_id,
            format!("{month}-01"),
            format!("{end_prefix}T23:59:59Z")
        ],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn sum_cogs_until(conn: &Connection, market_id: i64, end_prefix: &str) -> Result<f64, String> {
    let month = current_month_prefix();
    let sale_cogs: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM((i.quantity - i.returned_quantity) * i.cost_at_sale), 0)
             FROM sale_items i
             JOIN sales s ON s.id = i.sale_id
             WHERE s.market_id = ?1 AND s.created_at >= ?2 AND s.created_at <= ?3",
            params![
                market_id,
                format!("{month}-01"),
                format!("{end_prefix}T23:59:59Z")
            ],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|err| err.to_string())?;
    let legacy_cogs: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(u.quantity * p.cost_per_quantity), 0)
             FROM product_updates u
             JOIN products p ON p.id = u.product_id
             JOIN categories c ON c.id = p.category_id
             WHERE c.market_id = ?1 AND u.status = 'subed' AND u.sale_item_id IS NULL
               AND u.date >= ?2 AND u.date <= ?3",
            params![
                market_id,
                format!("{month}-01"),
                format!("{end_prefix}T23:59:59Z")
            ],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|err| err.to_string())?;
    Ok(sale_cogs + legacy_cogs)
}

fn sum_expenses_until(conn: &Connection, market_id: i64, end_prefix: &str) -> Result<f64, String> {
    let month = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(price), 0) FROM expenses
         WHERE market_id = ?1 AND date >= ?2 AND date <= ?3",
        params![
            market_id,
            format!("{month}-01"),
            format!("{end_prefix}T23:59:59Z")
        ],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn payments_from_body(
    body: &Value,
    payment_method: &str,
    total: f64,
) -> Result<Vec<(String, f64)>, String> {
    let mut payments = Vec::new();
    if let Some(items) = body.get("payments").and_then(Value::as_array) {
        for payment in items {
            let method = text_default(payment, "method", payment_method);
            let amount = number(payment, "amount");
            if amount < 0.0 {
                return Err("Payment amount cannot be negative".to_string());
            }
            if amount > 0.0 {
                payments.push((method, amount));
            }
        }
    }

    if payments.is_empty() {
        let default_paid = if payment_method == "debt" { 0.0 } else { total };
        let amount = number_default(body, "paid_amount", default_paid);
        if amount > 0.0 {
            let method = if payment_method == "mixed" {
                text_default(body, "primary_payment_method", "cash")
            } else {
                payment_method.to_string()
            };
            payments.push((method, amount));
        }
    }

    let paid: f64 = payments.iter().map(|(_, amount)| *amount).sum();
    if paid > total + 0.01 {
        return Err("Paid amount exceeds total".to_string());
    }
    Ok(payments)
}

fn ensure_supplier(
    conn: &Connection,
    market_id: i64,
    name: &str,
    phone: &str,
) -> Result<i64, String> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM suppliers WHERE market_id = ?1 AND name = ?2 AND phone = ?3",
            params![market_id, name, phone],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
    {
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO suppliers (market_id, name, phone, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![market_id, name, phone, now_iso()],
    )
    .map_err(|err| err.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn ensure_product_stock_batch_coverage(
    tx: &rusqlite::Transaction<'_>,
    product_id: i64,
) -> Result<(), String> {
    let (product_quantity, cost_per_quantity, product_date) = tx
        .query_row(
            "SELECT quantity, cost_per_quantity, date FROM products WHERE id = ?1",
            params![product_id],
            |row| {
                Ok((
                    row.get::<_, f64>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|err| err.to_string())?;
    if product_quantity <= 0.0 {
        return Ok(());
    }
    let batch_quantity: f64 = tx
        .query_row(
            "SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE product_id = ?1 AND quantity > 0",
            params![product_id],
            |row| row.get::<_, f64>(0),
        )
        .map_err(|err| err.to_string())?;
    let missing_quantity = product_quantity - batch_quantity;
    if missing_quantity > 0.000001 {
        tx.execute(
            "INSERT INTO stock_batches (product_id, batch_number, expiry_date, quantity, cost_per_quantity, created_at)
             VALUES (?1, 'opening-stock', '', ?2, ?3, ?4)",
            params![product_id, missing_quantity, cost_per_quantity, product_date],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn plan_stock_batch_allocations(
    tx: &rusqlite::Transaction<'_>,
    product_id: i64,
    quantity: f64,
) -> Result<Vec<StockBatchAllocation>, String> {
    ensure_product_stock_batch_coverage(tx, product_id)?;
    let mut stmt = tx
        .prepare(
            "SELECT id, quantity, cost_per_quantity
             FROM stock_batches
             WHERE product_id = ?1 AND quantity > 0
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![product_id], |row| {
            Ok(StockBatchAllocation {
                batch_id: row.get::<_, i64>(0)?,
                quantity: row.get::<_, f64>(1)?,
                cost_per_quantity: row.get::<_, f64>(2)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut remaining = quantity;
    let mut allocations = Vec::new();
    for row in rows {
        if remaining <= 0.000001 {
            break;
        }
        let batch = row.map_err(|err| err.to_string())?;
        let allocated_quantity = batch.quantity.min(remaining);
        if allocated_quantity > 0.0 {
            allocations.push(StockBatchAllocation {
                batch_id: batch.batch_id,
                quantity: allocated_quantity,
                cost_per_quantity: batch.cost_per_quantity,
            });
            remaining -= allocated_quantity;
        }
    }

    if remaining > 0.000001 {
        return Err("Omborda tannarx partiyalari yetarli emas".to_string());
    }
    Ok(allocations)
}

fn record_sale_item_batch_allocations(
    tx: &rusqlite::Transaction<'_>,
    sale_item_id: i64,
    allocations: &[StockBatchAllocation],
) -> Result<(), String> {
    for allocation in allocations {
        tx.execute(
            "INSERT INTO sale_item_batches (sale_item_id, stock_batch_id, quantity, cost_per_quantity)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                sale_item_id,
                allocation.batch_id,
                allocation.quantity,
                allocation.cost_per_quantity
            ],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn consume_stock_batch_allocations(
    tx: &rusqlite::Transaction<'_>,
    allocations: &[StockBatchAllocation],
) -> Result<(), String> {
    for allocation in allocations {
        tx.execute(
            "UPDATE stock_batches SET quantity = quantity - ?1 WHERE id = ?2",
            params![allocation.quantity, allocation.batch_id],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn restore_returned_stock_batches(
    tx: &rusqlite::Transaction<'_>,
    sale_item_id: i64,
    product_id: i64,
    sold_quantity: f64,
    return_quantity: f64,
) -> Result<(), String> {
    let mut stmt = tx
        .prepare(
            "SELECT stock_batch_id, quantity, cost_per_quantity
             FROM sale_item_batches
             WHERE sale_item_id = ?1
             ORDER BY id ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![sale_item_id], |row| {
            Ok(StockBatchAllocation {
                batch_id: row.get::<_, i64>(0)?,
                quantity: row.get::<_, f64>(1)?,
                cost_per_quantity: row.get::<_, f64>(2)?,
            })
        })
        .map_err(|err| err.to_string())?;
    let allocations = collect_vec(rows)?;

    if allocations.is_empty() || sold_quantity <= 0.0 {
        let cost_at_sale: f64 = tx
            .query_row(
                "SELECT cost_at_sale FROM sale_items WHERE id = ?1",
                params![sale_item_id],
                |row| row.get::<_, f64>(0),
            )
            .map_err(|err| err.to_string())?;
        tx.execute(
            "INSERT INTO stock_batches (product_id, batch_number, expiry_date, quantity, cost_per_quantity, created_at)
             VALUES (?1, 'returned-stock', '', ?2, ?3, ?4)",
            params![product_id, return_quantity, cost_at_sale, now_iso()],
        )
        .map_err(|err| err.to_string())?;
        return Ok(());
    }

    let mut restored = 0.0;
    for allocation in allocations {
        let restore_quantity = return_quantity * (allocation.quantity / sold_quantity);
        if restore_quantity <= 0.0 {
            continue;
        }
        restored += restore_quantity;
        tx.execute(
            "UPDATE stock_batches SET quantity = quantity + ?1 WHERE id = ?2",
            params![restore_quantity, allocation.batch_id],
        )
        .map_err(|err| err.to_string())?;
    }

    let rounding_gap = return_quantity - restored;
    if rounding_gap.abs() > 0.000001 {
        tx.execute(
            "UPDATE stock_batches
             SET quantity = quantity + ?1
             WHERE id = (
                SELECT stock_batch_id
                FROM sale_item_batches
                WHERE sale_item_id = ?2
                ORDER BY id ASC
                LIMIT 1
             )",
            params![rounding_gap, sale_item_id],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn sales_grouped_by_day(
    conn: &Connection,
    market_id: i64,
    month_prefix: &str,
) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT substr(s.created_at, 1, 10) AS day,
                    COALESCE(SUM(s.total - COALESCE((SELECT SUM(r.amount) FROM returns r WHERE r.sale_id = s.id), 0)), 0) AS total,
                    COUNT(s.id) AS sales_count
             FROM sales s
             WHERE s.market_id = ?1 AND s.created_at LIKE ?2
             GROUP BY day
             ORDER BY day",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![market_id, format!("{month_prefix}%")], |row| {
            Ok(json!({
                "date": row.get::<_, String>(0)?,
                "total": row.get::<_, f64>(1)?,
                "sales_count": row.get::<_, i64>(2)?
            }))
        })
        .map_err(|err| err.to_string())?;
    collect_vec(rows)
}

fn month_returns(conn: &Connection, market_id: i64) -> Result<f64, String> {
    let prefix = current_month_prefix();
    conn.query_row(
        "SELECT COALESCE(SUM(r.amount), 0)
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE s.market_id = ?1 AND r.created_at LIKE ?2",
        params![market_id, format!("{prefix}%")],
        |row| row.get::<_, f64>(0),
    )
    .map_err(|err| err.to_string())
}

fn month_cogs(conn: &Connection, market_id: i64) -> Result<f64, String> {
    let prefix = current_month_prefix();
    sum_cogs_until(conn, market_id, &format!("{prefix}-31"))
}

fn optional_text(value: &str) -> Option<&str> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn make_purchase_invoice_number(market_id: i64) -> String {
    format!(
        "P-{}-{}",
        market_id,
        OffsetDateTime::now_utc().unix_timestamp_nanos()
    )
}

fn collect_vec<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
) -> Result<Vec<T>, String> {
    let mut values = Vec::new();
    for row in rows {
        values.push(row.map_err(|err| err.to_string())?);
    }
    Ok(values)
}

fn collect_rows(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<Value>>,
) -> Result<ApiResponse, String> {
    ok_result(json!(collect_vec(rows)?))
}

fn ok_result(body: Value) -> Result<ApiResponse, String> {
    Ok(ok(body))
}

fn ok(body: Value) -> ApiResponse {
    ApiResponse {
        status: 200,
        body,
        content_type: "application/json".to_string(),
    }
}

fn error(status: u16, message: &str) -> ApiResponse {
    ApiResponse {
        status,
        body: json!({"error": message, "message": message}),
        content_type: "application/json".to_string(),
    }
}

fn normalize_path(raw: &str) -> String {
    let after_origin = raw
        .split_once("://")
        .and_then(|(_, rest)| rest.split_once('/').map(|(_, path)| format!("/{path}")))
        .unwrap_or_else(|| raw.to_string());
    let without_query = after_origin.split('?').next().unwrap_or(&after_origin);
    let api_index = without_query.find("/api/").unwrap_or(0);
    let mut path = without_query[api_index..].to_string();
    if !path.ends_with('/') {
        path.push('/');
    }
    path
}

fn path_id(path: &str, prefix: &str, suffix: &str) -> Option<i64> {
    path.strip_prefix(prefix)
        .and_then(|rest| rest.strip_suffix(suffix).or(Some(rest)))
        .and_then(|id| id.parse::<i64>().ok())
}

fn text(body: &Value, key: &str) -> String {
    body.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

fn text_default(body: &Value, key: &str, fallback: &str) -> String {
    let value = text(body, key);
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn media_value(body: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        match body.get(*key) {
            Some(Value::Object(image)) => {
                let value = image
                    .get("data_url")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .map(ToString::to_string)
                    .or_else(|| {
                        image
                            .get("name")
                            .and_then(Value::as_str)
                            .filter(|value| !value.trim().is_empty())
                            .map(ToString::to_string)
                    });
                if value.is_some() {
                    return value;
                }
            }
            Some(Value::String(image)) if !image.trim().is_empty() => {
                return Some(image.trim().to_string());
            }
            _ => {}
        }
    }
    None
}

fn image_value(body: &Value) -> Option<String> {
    media_value(body, &["image"])
}

fn integer(body: &Value, key: &str) -> i64 {
    body.get(key)
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_str()?.parse::<i64>().ok())
        })
        .unwrap_or(0)
}

fn number(body: &Value, key: &str) -> f64 {
    body.get(key)
        .and_then(|value| {
            value
                .as_f64()
                .or_else(|| value.as_str()?.parse::<f64>().ok())
        })
        .unwrap_or(0.0)
}

fn number_optional(body: &Value, key: &str) -> Option<f64> {
    body.get(key).and_then(|value| {
        value
            .as_f64()
            .or_else(|| value.as_str()?.parse::<f64>().ok())
    })
}

fn number_default(body: &Value, key: &str, fallback: f64) -> f64 {
    let value = number(body, key);
    if value == 0.0 {
        fallback
    } else {
        value
    }
}

fn product_status(quantity: f64, min_quantity: f64) -> String {
    if quantity <= 0.0 {
        "ended".to_string()
    } else if quantity <= min_quantity {
        "few".to_string()
    } else {
        "available".to_string()
    }
}

fn make_receipt_number(market_id: i64) -> String {
    format!(
        "R-{}-{}",
        market_id,
        OffsetDateTime::now_utc().unix_timestamp_nanos()
    )
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn current_month_prefix() -> String {
    let now = OffsetDateTime::now_utc();
    format!("{:04}-{:02}", now.year(), u8::from(now.month()))
}

fn current_month_name() -> String {
    let month = OffsetDateTime::now_utc().month();
    match month {
        Month::January => "January",
        Month::February => "February",
        Month::March => "March",
        Month::April => "April",
        Month::May => "May",
        Month::June => "June",
        Month::July => "July",
        Month::August => "August",
        Month::September => "September",
        Month::October => "October",
        Month::November => "November",
        Month::December => "December",
    }
    .to_string()
}

fn make_token() -> String {
    format!(
        "{}-{}",
        OffsetDateTime::now_utc().unix_timestamp_nanos(),
        std::process::id()
    )
}

fn csv(value: &Value) -> String {
    let raw = value
        .as_str()
        .map(ToString::to_string)
        .unwrap_or_else(|| value.to_string());
    format!("\"{}\"", raw.replace('"', "\"\""))
}
