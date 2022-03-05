import WebSocket from 'ws';

import {
    ControllerDeviceUpdate,
    ControllerDeviceUpdateRequest,
    devices,
    updateDevice
} from './main';
import config from '../config.json';

const tokens = config?.tokens;

let ws: WebSocket.Server;
let clients: DeviceClient[];

interface SocketStatus {
    alive?: boolean;
    authorized?: boolean;
}

interface DeviceClient extends WebSocket {
    state: SocketStatus;
    watchingIds: string[];
}

export const startWebSocketServer = () => {
    const host = process.env.HOST || '0.0.0.0';
    const port = Number(process.env.PORT) || 3002;

    ws = new WebSocket.Server({ host, port });
    clients = ws.clients as unknown as DeviceClient[];

    ws.on('connection', async (client: DeviceClient, req) => {
        client.state = {
            alive: true,
            authorized: false
        };
        client.watchingIds = [];

        client.send(
            JSON.stringify({
                connection: {
                    auth: {
                        token: tokens.provide
                    }
                }
            })
        );

        client.on('pong', () => (client.state.alive = true));

        client.on('message', data => onMessage(data, client));
    });

    console.log(`[Ready] WebSocket Server Listening on ws://${host}:${port}`);
};

interface OutboundSocketMessage {
    commands?: {
        controllerDeviceUpdate: ControllerDeviceUpdate;
    }[];
    connection?: {
        pong?: true;
        auth?: {
            authorized?: boolean;
            token?: string;
        };
    };
    errors?: any[];
}

interface InboundSocketMessage {
    commands?: {
        controllerDeviceUpdateRequest: ControllerDeviceUpdateRequest;
        watchDeviceIds: string[];
    }[];
    connection?: {
        pong?: true;
        auth?: {
            authorized?: boolean;
            token?: string;
        };
    };
    errors?: any[];
}

const onMessage = async (message: WebSocket.Data, client: DeviceClient) => {
    let data: InboundSocketMessage;

    try {
        data = JSON.parse(message.toString());
    } catch {
        return client.send('Invalid JSON');
    }

    if (data?.connection?.pong === true) {
        client.state.alive = true;
    }

    // Check if remote's authorization token is provided
    if (data?.connection?.auth?.token) {
        client.state.authorized = data.connection.auth.token === tokens.verify;

        if (client.state.authorized) {
            client.send(
                JSON.stringify({
                    connection: {
                        auth: {
                            authorized: true
                        }
                    }
                })
            );
        }
    }

    // Send our authorization token if requested
    if (data?.connection?.auth?.authorized === false) {
        client.send(
            JSON.stringify({
                connection: {
                    auth: {
                        token: tokens.provide
                    }
                }
            })
        );
    }

    // Return if not authorized
    if (client.state.authorized === false) {
        return client.send(
            JSON.stringify({
                connection: {
                    auth: {
                        authorized: false
                    }
                }
            })
        );
    }

    data?.commands?.forEach(command => {
        if (command?.controllerDeviceUpdateRequest) {
            updateDevice(command?.controllerDeviceUpdateRequest);
        }

        if (command?.watchDeviceIds) {
            client.watchingIds.push(...command?.watchDeviceIds);

            const simpleRequiredDevices = [...devices.values()]
                .map(({ id, status }) => ({ id, status }))
                .filter(device => device.status.state !== null)
                .filter(device => command?.watchDeviceIds.includes(device.id));

            simpleRequiredDevices.forEach(device => {
                const controllerDeviceUpdate: ControllerDeviceUpdate = {
                    id: device.id,
                    status: device.status
                };

                notifyClients(controllerDeviceUpdate);
            });
        }
    });
};

export const notifyClients = (update: ControllerDeviceUpdate) => {
    clients?.forEach(client => {
        if (!client.watchingIds.includes(update.id)) return;

        client.send(
            JSON.stringify({
                commands: [
                    {
                        controllerDeviceUpdate: update
                    }
                ]
            })
        );
    });
};

setInterval(() => {
    clients?.forEach(client => {
        if (!client.state.alive) return client.close();

        client.state.alive = false;

        client.send(JSON.stringify({ connection: { ping: true } }));
        client.ping();
    });
}, 3000);
