import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const Region = sequelize.define('Region', {
        region_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },
        nama_region: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        db_host: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        db_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        db_user: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        db_password: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
       
    }, {
        tableName: 'regions',
        timestamps: true, 
        
    });

    return Region;
};
