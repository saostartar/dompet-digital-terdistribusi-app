import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const TransactionRegional = sequelize.define('TransactionRegional', {
        transaction_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        tipe_transaksi: {
            // SAGA_PENDING_CREDIT: untuk transfer keluar inter-region, menunggu konfirmasi kredit di region tujuan
            // SAGA_FAILED_COMPENSATED: untuk transfer keluar inter-region yang gagal dan sudah dikompensasi
            type: DataTypes.ENUM('TOPUP', 'WITHDRAWAL', 'TRANSFER_MASUK', 'TRANSFER_KELUAR', 'SAGA_PENDING_CREDIT', 'SAGA_FAILED_COMPENSATED'),
            allowNull: false,
        },
        user_id_regional: { // user_id_master dari pengguna di region ini yang terlibat
            type: DataTypes.INTEGER,
            allowNull: false,
            // Tidak ada foreign key constraint langsung ke users_regional di sini
            // karena user_id_master bukan auto-increment di users_regional.
            // Integritas dijaga oleh aplikasi.
        },
        user_id_terkait: { // user_id_master dari pengguna lain (bisa di region sama atau beda)
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        region_id_user_terkait: { // region_id dari pengguna terkait jika transfer
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        nominal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        saldo_sebelum: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        saldo_sesudah: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        waktu_transaksi: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false,
        },
        status: {
            // PENDING: Untuk transaksi yang mungkin butuh konfirmasi eksternal (jarang dipakai di sini selain SAGA)
            // COMPLETED: Transaksi sukses
            // FAILED: Transaksi gagal
            // CANCELLED: Transaksi dibatalkan
            // SAGA_PENDING_CREDIT & SAGA_FAILED_COMPENSATED digunakan oleh tipe_transaksi juga, tapi bisa juga di status
            type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SAGA_PENDING_CREDIT', 'SAGA_FAILED_COMPENSATED'),
            allowNull: false,
            defaultValue: 'PENDING',
        },
        keterangan: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        id_transaksi_global: { // ID dari global_transaction_logs setelah sinkronisasi
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        // createdAt dan updatedAt otomatis
    }, {
        tableName: 'transactions',
        timestamps: true,
    });

    // Asosiasi konseptual ke UserRegional (user_id_regional) dan UserMaster (user_id_terkait)
    // dijaga oleh logika aplikasi.

    return TransactionRegional;
};
