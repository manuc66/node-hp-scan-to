"use strict";

module.exports = class WalkupScanDestination {
    constructor(data) {
        this.data = data;
    }

    get name() {
        return this.data["dd:Name"][0];
    }

    get hostname() {
        return this.data["dd:ResourceURI"][0];
    }

    get resourceURI() {
        return this.data["dd:ResourceURI"][0];
    }

    get shortcut() {
        return this.data["wus:WalkupScanDestinations"]["wus:WalkupScanDestination"]["0"]["wus:WalkupScanSettings"]["0"]["wus:Shortcut"][0];
    }

    /**
     * @return {string}
     */
    getContentType() {
        return this.shortcut === "SavePDF" ? "Document" : "Photo";
    }
};