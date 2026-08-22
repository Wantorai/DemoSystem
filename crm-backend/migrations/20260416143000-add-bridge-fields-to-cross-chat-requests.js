'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('cross_company_chat_requests', 'requesterUserId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('cross_company_chat_requests', 'externalRequestId', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('cross_company_chat_requests', 'bridgeMeta', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: {},
    });

    await queryInterface.addIndex('cross_company_chat_requests', ['externalRequestId'], {
      name: 'idx_cross_chat_req_external_id',
    });

    await queryInterface.addIndex('cross_company_chat_requests', ['requesterDomain', 'externalRequestId', 'direction'], {
      name: 'idx_cross_chat_req_domain_external_direction',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('cross_company_chat_requests', 'idx_cross_chat_req_domain_external_direction');
    await queryInterface.removeIndex('cross_company_chat_requests', 'idx_cross_chat_req_external_id');
    await queryInterface.removeColumn('cross_company_chat_requests', 'bridgeMeta');
    await queryInterface.removeColumn('cross_company_chat_requests', 'externalRequestId');
    await queryInterface.changeColumn('cross_company_chat_requests', 'requesterUserId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};
