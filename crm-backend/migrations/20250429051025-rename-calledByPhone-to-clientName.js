'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.renameColumn('records', 'calledByPhone', 'clientPhone');
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.renameColumn('records', 'clientPhone', 'calledByPhone');
  }
};
