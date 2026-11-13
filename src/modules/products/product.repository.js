import { randomUUID } from "node:crypto";

// Temporary storage.
// Data in this array will be lost when the server restarts.
const products = [];

export const productRepository = {
  // Save a new product in our temporary storage
  create(productData) {
    const product = {
      id: randomUUID(),
      ...productData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    products.push(product);

    return product;
  },

  // Return products for the requested page
  findAll({ skip, limit }) {
    return products.slice(skip, skip + limit);
  },

  // Count all products so the API can calculate total pages
  count() {
    return products.length;
  },

  // Find one product using its ID
  findById(id) {
    return products.find((product) => product.id === id) || null;
  },

  // Update an existing product
  update(id, updateData) {
    const productIndex = products.findIndex((product) => product.id === id);

    if (productIndex === -1) {
      return null;
    }

    // Keep existing fields and replace only the supplied fields
    products[productIndex] = {
      ...products[productIndex],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    return products[productIndex];
  },

  // Remove a product and return the removed product
  delete(id) {
    const productIndex = products.findIndex((product) => product.id === id);

    if (productIndex === -1) {
      return null;
    }

    const [deletedProduct] = products.splice(productIndex, 1);

    return deletedProduct;
  },
};
