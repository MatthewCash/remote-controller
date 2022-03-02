import { exec, ExecException } from 'child_process';
import { TypedEmitter } from 'tiny-typed-emitter';
import { ControllerDeviceUpdate } from './main';

interface DeviceConstructor {
    id: Device['id'];
}

interface DeviceEvents {
    statusUpdate: (update: ControllerDeviceUpdate) => void;
}

interface DeviceStatus {
    online: boolean; // Device is reachable
    state: any; // Controlled state
    changingTo?: DeviceStatus['state']; // Device is changing to state
}

export class Device extends TypedEmitter<DeviceEvents> {
    id: string;
    status: DeviceStatus;

    private pollInterval?: NodeJS.Timer;

    constructor({ id }: DeviceConstructor) {
        super();

        this.id = id;

        this.status = {
            online: false,
            state: {
                power: false
            },
            changingTo: null
        };
    }

    startPolling() {
        this.pollInterval = setInterval(this.pollState.bind(this), 1000);
    }

    async setState(requestedState: DeviceStatus['state']): Promise<boolean> {
        if (requestedState?.power == null) return;

        const onOff = requestedState?.power ? 'on' : 'off';

        const error = await new Promise<ExecException>(r =>
            exec(
                `/usr/bin/sudo /usr/bin/bash /opt/remote-controller/scripts/${this.id}/${onOff}.sh`,
                r
            )
        );

        return !error || error?.code === 0;
    }

    private async queryState(): Promise<boolean> {
        const error = await new Promise<ExecException>(r =>
            exec(
                `/usr/bin/sudo /usr/bin/bash /opt/remote-controller/scripts/${this.id}/query.sh`,
                r
            )
        );

        return !error || error?.code === 0;
    }

    private async pollState() {
        const powerState = await this.queryState();

        if (powerState === this.status?.state?.power) return;

        this.status = {
            changingTo: null,
            online: true,
            state: {
                power: powerState
            }
        };

        const update = {
            id: this.id,
            status: this.status
        };

        this.emit('statusUpdate', update);
    }
}
