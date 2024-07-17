import {
    Address,
    beginCell,
    Builder,
    Cell,
    Contract,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
    address
} from 'ton-core';


export type NFTItemData = {
    init: boolean
    index: bigint
    collection: Address
    owner: Address
    content: string
}

export class NFTItem implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new NFTItem(address);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell()
        });
    }

    async sendTransfer(provider: ContractProvider, via: Sender, params: {
        value?: bigint
        to: Address
        responseTo?: Address
        forwardAmount?: bigint
        forwardBody?: Cell | Builder
    }) {
        await provider.internal(via, {
            value: params.value ?? toNano('0.05'),
            body: beginCell()
                .storeUint(0x5fcc3d14, 32) // op
                .storeUint(0, 64) // query id
                .storeAddress(params.to)
                .storeAddress(params.responseTo)
                .storeBit(false) // custom payload
                .storeCoins(params.forwardAmount ?? 0n)
                .storeMaybeRef(params.forwardBody)
                .endCell()
        });
    }

    async getData(provider: ContractProvider): Promise<NFTItemData> {
        try {
            const { stack } = await provider.get('get_nft_data', []);
            return {
                init: stack.readBigNumber() == -1n,
                index: stack.readBigNumber(),
                collection: stack.readAddress(),
                owner: stack.readAddress(),
                content: stack.readString()
            };
        } catch (e) {
            const empty = address('0:0000000000000000000000000000000000000000000000000000000000000000');
            return {
                init: false,
                index: 0n,
                collection: empty,
                owner: empty,
                content: ''
            };
        }
    }

    async getOwner(provider: ContractProvider) {
        const result = await this.getData(provider);
        return result.owner;
    }
}
