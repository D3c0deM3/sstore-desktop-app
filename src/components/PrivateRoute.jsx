import React from "react";
import { Navigate } from "react-router-dom";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  if (!token) {
    // No token? Redirect to login page
    return <Navigate to="/signin" replace />;
  }

  // Token exists, render the children components
  return children;
};

export default PrivateRoute;
