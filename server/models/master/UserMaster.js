import { DataTypes }
from 'sequelize';

export default (sequelize) => {
    const UserMaster = sequelize.define('UserMaster', {
        user_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        username: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        nama_lengkap: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        nomor_telepon: {
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true,
        },
        region_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'regions',
                key: 'region_id',
            },
        },
        
    }, {
        tableName: 'users',
        timestamps: true,
    });

    // Definisikan Asosiasi di sini jika model Region sudah diimpor dan diinisialisasi
    UserMaster.associate = (models) => {
        UserMaster.belongsTo(models.Region, {
            foreignKey: 'region_id',
            as: 'region', // Alias untuk asosiasi
        });
    };

    return UserMaster;
};
