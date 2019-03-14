const OffchainPayment = artifacts.require("OffchainPayment");

module.exports = function(deployer) {
  deployer.deploy(OffchainPayment, "0x7C765426aB9d7BCCf151C3d8D03f1368c50c9408", "0x7C765426aB9d7BCCf151C3d8D03f1368c50c9408", "0x7C765426aB9d7BCCf151C3d8D03f1368c50c9408",
  "0x7C765426aB9d7BCCf151C3d8D03f1368c50c9408");
};
