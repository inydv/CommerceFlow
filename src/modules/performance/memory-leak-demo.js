// This file is for local memory-leak experiments only.

const PRODUCTS_PER_REPORT = 20_000;
const MAX_SAVED_REPORTS = 20;

// Intentionally holds references to report data.
// A global collection remains alive between API requests.
const leakedReports = [];

// Build some dummy product objects in memory.
const generateProducts = () => {
  return Array.from({ length: PRODUCTS_PER_REPORT }, (_, index) => ({
    id: index + 1,
    name: `Product-${Date.now()}-${index}`,
    price: 1000 + index,
    category: "Electronics",
  }));
};

// BAD: Keep every generated report in memory.
export const runLeakyReport = () => {
  // Limit the experiment so we don't grow memory indefinitely.
  if (leakedReports.length >= MAX_SAVED_REPORTS) {
    return {
      accepted: false,
      savedReports: leakedReports.length,
    };
  }

  const products = generateProducts();

  // This is the memory leak:
  // Old reports remain reachable through this global array.
  leakedReports.push(products);

  return {
    accepted: true,
    productCount: products.length,
    savedReports: leakedReports.length,
  };
};

// GOOD: Use the data and don't store an unnecessary reference.
export const runSafeReport = () => {
  const products = generateProducts();

  // Process the generated products.
  const totalPrice = products.reduce((sum, product) => sum + product.price, 0);

  // Only return the summary, not the full array.
  // After the function returns, the products array
  // is no longer intentionally retained.
  return {
    productCount: products.length,
    totalPrice,
  };
};

// Release all report references created by this experiment.
export const clearLeakedReports = () => {
  leakedReports.length = 0;

  return { savedReports: 0 };
};

export const getLeakStats = () => ({
  savedReports: leakedReports.length,
  maxSavedReports: MAX_SAVED_REPORTS,
  retainedProductObjects: leakedReports.length * PRODUCTS_PER_REPORT,
});
