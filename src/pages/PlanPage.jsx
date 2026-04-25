import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/PlanPage.css";

const plans = [
  {
    name: "Standart Plan",
    price: "$50/month",
    features: [
      "25 Market Reports / month",
      "Advanced Data Visualization",
      "Export in PDF, Excel & PPT",
      "Industry Trends & Forecasts",
      "Priority Email Support",
    ],
  },
  {
    name: "PRO Plan",
    price: "$100/month",
    features: [
      "25 Market Reports / month",
      "Advanced Data Visualization",
      "Export in PDF, Excel & PPT",
      "Industry Trends & Forecasts",
      "Priority Email Support",
    ],
    mostPreferred: true,
  },
  {
    name: "VIP Plan",
    price: "$140/month",
    features: [
      "25 Market Reports / month",
      "Advanced Data Visualization",
      "Export in PDF, Excel & PPT",
      "Industry Trends & Forecasts",
      "Priority Email Support",
    ],
  },
];

const PlanPage = () => {
  const navigate = useNavigate();

  const handlePlanSelect = async (selectedPlan) => {
    const market = JSON.parse(localStorage.getItem("market"));
    market.plan = selectedPlan;
    localStorage.setItem("market", JSON.stringify(market));

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";

    try {
      const planResponse = await fetch(`${apiBaseUrl}/api/market/plan/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (planResponse.ok) {
        const planData = await planResponse.json();
        if (planData.market) {
          localStorage.setItem("market", JSON.stringify(planData.market));
        }
      }

      const response = await fetch(`${apiBaseUrl}/api/dashboard`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`, // <-- fixed here
          "Content-Type": "application/json",
        },
      });

      const rawText = await response.text();
      console.log("RAW RESPONSE TEXT:", rawText);

      if (rawText.trim()) {
        try {
          const data = JSON.parse(rawText);
          console.log("Parsed JSON:", data);

          navigate("/dashboard", { state: { dashboardData: data } });
        } catch (parseError) {
          console.error("Failed to parse JSON:", parseError);
        }
      } else {
        console.log("Response was empty.");
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
    }
  }, [navigate]);

  const highlightPlanWord = (text) => {
    const parts = text.split(" ");
    if (parts.length > 1) {
      const planWord = parts.pop();
      return (
        <>
          {parts.join(" ")} <span className="highlight-plan">{planWord}</span>
        </>
      );
    }
    return text;
  };

  return (
    <div className="plan-page">
      <h1 className="plan-title">TARIFLAR</h1>
      <div className="plan-cards">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`plan-card ${plan.mostPreferred ? "preferred" : ""}`}
          >
            {plan.mostPreferred && (
              <div className="most-preferred">most preferred</div>
            )}
            <h2>{highlightPlanWord(plan.name)}</h2>
            <p className="price">{plan.price}</p>
            <ul>
              {plan.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
            <button onClick={() => handlePlanSelect(plan.name)}>BUY NOW</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanPage;
