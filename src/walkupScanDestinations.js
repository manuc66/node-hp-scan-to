"use strict";

const WalkupScanDestination = require("./walkupScanDestination");

module.exports = class WalkupScanDestinations {
    constructor(data) {
        this.data = data;
    }

    /**
     *
     * @returns {WalkupScanDestination[]}
     */
    get destinations() {
        let walkupScanDestinations = this.data["wus:WalkupScanDestinations"];
        if (walkupScanDestinations.hasOwnProperty("wus:WalkupScanDestination")) {
            return walkupScanDestinations["wus:WalkupScanDestination"].map(x => new WalkupScanDestination(x));
        }
        else {
            return [];
        }

    }
};