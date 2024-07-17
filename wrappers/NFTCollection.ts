import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano
} from 'ton-core';
import { NFTItem } from './NFTItem';

export type NftCollectionRoyaltyParams = {
    numerator: number
    denominator: number
    destination: Address
}

export type NftCollectionData = {
    nextItemIndex: number
    content: Cell
    owner: Address
}

// https://github.com/ton-org/sandbox/blob/a5adb7db703a3dca1026be0ca73f9bc8bcc1411e/examples/contracts/NftCollection.ts#L75
export type NftCollectionConfig = {
    owner: Address
    nextItemIndex?: number
    content?: Cell
    itemCode?: Cell
    royaltyParams?: Cell
};

export type NFTCollectionConfig = {
    adminAddress: Address;
    nftItemCode: Cell;
};

enum TokenDataContentLayout {
    OnChain = 0x0,
    OffChain = 0x01,
}

export function tokenDataContent(content: Cell): string {
    // https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md#content-representation
    const data = content.asSlice();
    const type = Number(data.loadUintBig(8));
    switch (type) {
        case TokenDataContentLayout.OffChain:
            return data.loadStringTail();
        case TokenDataContentLayout.OnChain:
            return 'TODO On-chain content layout';
        default:
            return 'TODO Semi-chain content layout';
    }
}

const OFFCHAIN_CONTENT_PREFIX = 0x01;

const serializeUri = (uri: string) => {
    return new TextEncoder().encode(encodeURI(uri));
};

function create_content() {
    const contentBuffer = serializeUri('https://api.tonnel.network/metadata');
    const contentBaseBuffer = serializeUri('https://api.tonnel.network/nft/');
    var content_cell = beginCell().storeUint(OFFCHAIN_CONTENT_PREFIX, 8);
    contentBuffer.forEach((byte) => {
        content_cell.storeUint(byte, 8);
    });

    var content_base = beginCell();
    contentBaseBuffer.forEach((byte) => {
        content_base.storeUint(byte, 8);
    });
    return beginCell().storeRef(content_cell.endCell()).storeRef(content_base.endCell());
}

export function NFTCollectionConfigToCell(config: NFTCollectionConfig) {

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeUint(0, 64)// next_item_index
        .storeRef(create_content().endCell())
        .storeRef(config.nftItemCode)
        .storeRef(beginCell().storeUint(5, 16).storeUint(100, 16).storeAddress(config.adminAddress).endCell())
        .storeRef(beginCell().storeCoins(0).storeUint(10, 32).endCell())
        .endCell();
}

enum NFTCollectionOP {
    deployNewNft = 1,
    batchDeployOfNewNfts = 2,
    changeOwner = 3,
    changeContent = 4,
}

export class NFTCollection implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
    }

    static createFromAddress(address: Address) {
        return new NFTCollection(address);
    }

    static createFromConfig(config: NFTCollectionConfig, code: Cell, workchain = 0) {
        const data = NFTCollectionConfigToCell(config);
        const init = { code, data };
        return new NFTCollection(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell()
        });
    }

    async sendChangeOwner(
        provider: ContractProvider,
        via: Sender,
        opts: {
            newOwner: Address;
            queryId: number;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(NFTCollectionOP.changeOwner, 32)
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.newOwner)
                .endCell()
        });
    }

    async sendChangeContent(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId: number;
            value: bigint;
            newOwner: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(NFTCollectionOP.changeContent, 32)
                .storeUint(opts.queryId, 64)
                // .storeRef(/* TODO cell content*/)
                // .storeRef(/* TODO cell royalty_params*/)
                .endCell()
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            toAddress: Address;
            value: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(222, 32) // opcode (reference TODO)
                .storeUint(0, 64) // queryid
                .storeCoins(toNano('0.02')) // gas fee
                .storeRef(
                    beginCell().storeAddress(opts.toAddress).endCell()
                )
                .endCell()
        });
    }

    async sendChangePrice(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            price: number
            many: number
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(4, 32) // opcode (reference TODO)
                .storeUint(0, 64) // queryid
                .storeCoins(toNano(opts.price)) // price NFT
                .storeUint(opts.many, 32) // how many
                .endCell()
        });
    }

    async getAddress(provider: ContractProvider, index: bigint) {
        const result = await provider.get('get_nft_address_by_index', [
            { type: 'int', value: index }
        ]);
        return result.stack.readAddress();
    }

    async getCollectionData(provider: ContractProvider): Promise<NftCollectionData> {
        const { stack } = await provider.get('get_collection_data', []);
        const nextItemIndex = stack.readNumber();
        const content = stack.readCell();
        const owner = stack.readAddress();
        return {
            nextItemIndex,
            content,
            owner
        };
    }

    async getRoyaltyParams(provider: ContractProvider): Promise<NftCollectionRoyaltyParams> {
        const { stack } = await provider.get('royalty_params', []);
        return {
            numerator: stack.readNumber(),
            denominator: stack.readNumber(),
            destination: stack.readAddress()
        };
    }
}
