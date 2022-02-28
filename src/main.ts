import { notifyClients, startWebSocketServer } from './wsServer';
import { Device } from './Device';

import config from '../config.json';

export interface DeviceStatus {
    online: boolean; // Device is reachable
    state: any; // Controlled state
    changingTo?: DeviceStatus['state']; // Device changing state
}

// Notify controllers device should be updated
export interface ControllerDeviceUpdateRequest {
    id: Device['id'];
    requestedState: DeviceStatus['state'];
}

// Controller reports new device state
export interface ControllerDeviceUpdate {
    id: Device['id'];
    status: DeviceStatus;
}

export const devices = new Map<Device['id'], Device>();

export const updateDevice = (update: ControllerDeviceUpdateRequest) => {
    devices.get(update.id)?.setState(update.requestedState);
};

const loadDevices = () => {
    config?.devices.forEach(deviceConfig => {
        const device = new Device({ id: deviceConfig.id });
        device.startPolling();

        device.on('statusUpdate', notifyClients);

        devices.set(device.id, device);
    });
};

const main = async () => {
    startWebSocketServer();

    loadDevices();
};

main();
