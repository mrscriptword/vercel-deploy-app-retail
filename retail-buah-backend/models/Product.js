const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  harga: { type: Number, required: true },
  stok: { type: Number, required: true },
  deskripsi: String,
  gambar: String, // URL Gambar
  unit: { type: String, default: 'kg' } // kg, gram, atau pcs
});

module.exports = mongoose.model('Product', productSchema);