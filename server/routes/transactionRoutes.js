// routes/transactionRoutes.js
import express from "express";
import {
  topUpSaldo,
  ambilSaldo,
  getRiwayatTransaksi,
  transferSaldo,
} from "../controllers/transactionController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rute untuk Top-Up Saldo
// POST /api/transactions/topup
router.post("/topup", protect, topUpSaldo);

// Rute untuk Ambil Saldo (Withdrawal)
// POST /api/transactions/withdraw
router.post("/withdraw", protect, ambilSaldo);

// Rute untuk Mendapatkan Riwayat Transaksi
// GET /api/transactions/history
router.get("/history", protect, getRiwayatTransaksi);

// Rute untuk Transfer Saldo
// POST /api/transactions/transfer
router.post("/transfer", protect, transferSaldo);

export default router;
