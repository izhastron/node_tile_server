const mapnik = require('mapnik')
const config = require('../config')
const proj4 = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs +over';
const mercator = new mapnik.Projection(proj4)

class Mercator {
    constructor() {
        this.cache = { bc: [], cc: [], zc: [] }
        this.radToDeg = 180 / Math.PI
        this.size = config.tileSize
        let size = this.size 
        for (let index = config.minZoom; index <= config.maxZoom; index++) {
            this.cache.bc.push(size / 360)
            this.cache.cc.push(size / (2 * Math.PI))
            this.cache.zc.push(size / 2)
            size *= 2
        }
    }
    pxTolatlon ([x, y], zoom) {
        const lat = (x - this.cache.zc[zoom]) / this.cache.bc[zoom]
        const lon = this.radToDeg * (2 * Math.atan(Math.exp((y - this.cache.zc[zoom]) / (-this.cache.cc[zoom]))) - 0.5 * Math.PI)
        return [lat, lon]
    }
    xyzToEnvelope = function(x, y, zoom) {
        const bbox = this.pxTolatlon([x * this.size, (y + 1) * this.size], zoom)
        .concat(this.pxTolatlon([(x + 1) * this.size, y * this.size], zoom))
        return mercator.forward(bbox)
    }
}
module.exports = new Mercator()

