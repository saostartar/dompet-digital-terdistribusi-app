import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const GlobalTransactionLog = sequelize.define('GlobalTransactionLog', {
        log_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        transaction_id_regional: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        tipe_transaksi: {
            type: DataTypes.ENUM('TOPUP', 'WITHDRAWAL', 'TRANSFER', 'SAGA_COMPENSATION'),
            allowNull: false,
        },
        user_id_pengirim: { // User yang melakukan aksi atau pengirim transfer
            type: DataTypes.INTEGER,
            allowNull: true, // Nullable untuk topup/withdrawal sistem mungkin
            references: {
                model: 'users',
                key: 'user_id',
            },
        },
        user_id_penerima: { // User penerima transfer
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'user_id',
            },
        },
        nominal: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
        },
        waktu_transaksi_regional: {
            type: DataTypes.DATE, // Menggunakan DATE karena TIMESTAMP di MySQL punya range terbatas
            allowNull: true, // Jika log ini bukan dari sinkronisasi transaksi regional
        },
        region_sumber_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'regions',
                key: 'region_id',
            },
        },
        region_tujuan_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'regions',
                key: 'region_id',
            },
        },
        status: {
            type: DataTypes.STRING(20), // Misal: COMPLETED, FAILED, PENDING_SAGA
            allowNull: false,
            defaultValue: 'COMPLETED',
        },
        keterangan: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        // createdAt dan updatedAt otomatis
    }, {
        tableName: 'global_transaction_logs',
        timestamps: true,
    });

    GlobalTransactionLog.associate = (models) => {
        GlobalTransactionLog.belongsTo(models.UserMaster, {
            foreignKey: 'user_id_pengirim',
            as: 'pengirim',
        });
        GlobalTransactionLog.belongsTo(models.UserMaster, {
            foreignKey: 'user_id_penerima',
            as: 'penerima',
        });
        GlobalTransactionLog.belongsTo(models.Region, {
            foreignKey: 'region_sumber_id',
            as: 'regionSumber',
        });
        GlobalTransactionLog.belongsTo(models.Region, {
            foreignKey: 'region_tujuan_id',
            as: 'regionTujuan',
        });
    };

    return GlobalTransactionLog;
};
