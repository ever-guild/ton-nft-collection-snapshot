import 'dotenv/config';
import { Config } from '@ton/blueprint';

export const config: Config = {
    network: {
        endpoint: process.env.TONCENTER_ENDPOINT || 'https://toncenter.com/api/v2/jsonRPC',
        key: process.env.TONCENTER_KEY,
    },
}
