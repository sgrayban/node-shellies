const EventEmitter = require('events')

const Coap = require('./lib/coap')
const Device = require('./lib/device')
const request = require('./lib/http-request')
const StatusUpdatesListener = require('./lib/status-updates-listener')

const deviceKey = (type, id) => `${type}#${id}`

class Shellies extends EventEmitter {
  constructor() {
    super()

    this._devices = new Map()
    this._listener = new StatusUpdatesListener()

    this._listener
      .on('start', () => { this.emit('start') })
      .on('stop', () => { this.emit('stop') })
      .on('statusUpdate', this._statusUpdateHandler.bind(this))

    this.staleTime = 8 * 60 * 60 * 1000
  }

  get running() {
    return this._listener.listening
  }

  [Symbol.iterator]() {
    return this._devices.values()
  }

  _statusUpdateHandler(msg) {
    const key = deviceKey(msg.deviceType, msg.deviceId)
    let device = this._devices.get(key)

    if (device) {
      device.update(msg)
    } else {
      device = Device.create(msg.deviceType, msg.deviceId, msg.host)

      if (device) {
        device.update(msg)
        device.on('offline', this._deviceOfflineHandler.bind(this))
        this._devices.set(key, device)
        this.emit('discover', device)
      } else {
        this.emit('unknownDevice', msg.deviceType, msg.deviceId, msg.host)
      }
    }
  }

  _deviceOfflineHandler(device) {
    const staleTimeout = setTimeout(() => {
      this.emit('stale', device)
      this.removeDevice(device)
    }, this.staleTime)

    device.once('online', () => {
      clearTimeout(staleTimeout)
    })
  }

  setAuthCredentials(username, password) {
    request.auth(username, password)
  }

  async start() {
    await this._listener.start()
  }

  stop() {
    this._listener.stop()
  }

  getDevice(type, id) {
    return this._devices.get(deviceKey(type, id))
  }

  addDevice(device) {
    this._devices.set(deviceKey(device.type, device.id), device)
    device.on('offline', this._deviceOfflineHandler.bind(this))
    this.emit('add', device)
  }

  removeDevice(device) {
    this._devices.delete(deviceKey(device.type, device.id))
    this.emit('remove', device)
  }
}

const shellies = new Shellies()

shellies.Coap = Coap
shellies.createDevice = Device.create.bind(Device)
shellies.request = request
shellies.StatusUpdatesListener = StatusUpdatesListener

module.exports = shellies
