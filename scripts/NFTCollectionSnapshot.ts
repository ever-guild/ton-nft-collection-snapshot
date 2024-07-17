import fs from 'fs';
import { Address } from 'ton-core';
import { NetworkProvider, sleep } from '@ton-community/blueprint';
import { NFTCollection, tokenDataContent } from '../wrappers/NFTCollection';
import { NFTItem } from '../wrappers/NFTItem';

if (!process.env.NFT_COLLECTION) {
    throw new Error('Address NFT Collection is missing');
}
const NFT_COLLECTION = process.env.NFT_COLLECTION;

export type BlockShort = {
    seqno: number,
    shard: string,
    workchain: number,
}

export type Royalty = {
    numerator: number
    denominator: number
    destination: string
}

export type NFTCollectionInfo = {
    address: string
    itemCount: number
    content: string
    owner: string
    royalty: Royalty
}

export type NFTOwnerStat = {
    count: number
    items: string[]
}

export type NFTCollectionSnapshot = {
    atBlock: BlockShort
    collection: NFTCollectionInfo
    owners: Record<string, NFTOwnerStat>
}

export async function run(provider: NetworkProvider) {
    const collection = provider.open(
        NFTCollection.createFromAddress(Address.parse(NFT_COLLECTION))
    );
    const block = (await provider.api().getLastBlock()).last;
    const collectionData = await collection.getCollectionData();
    const itemCount = collectionData.nextItemIndex;
    const royalty = await collection.getRoyaltyParams();
    const snapshot: NFTCollectionSnapshot = {} as NFTCollectionSnapshot;
    snapshot.atBlock = {
        seqno: block.seqno,
        shard: block.shard,
        workchain: block.workchain
    };
    snapshot.collection = {
        address: NFT_COLLECTION,
        itemCount,
        content: tokenDataContent(collectionData.content),
        owner: collectionData.owner.toString(),
        royalty: {
            numerator: royalty.numerator,
            denominator: royalty.denominator,
            destination: royalty.destination.toString()
        }
    };
    snapshot.owners = {};
    for (let i = 0; i < itemCount; i++) {
        const address = await collection.getAddress(BigInt(i));
        console.log(`#${i} ${address.toString()}`);
        const nft = provider.open(NFTItem.createFromAddress(address));
        const nftData = await nft.getData();
        if (!nftData.init) {
            continue;
        }
        const owner = nftData.owner.toString();
        if (!snapshot.owners[owner]) {
            snapshot.owners[owner] = { count: 0, items: [] };
        }
        snapshot.owners[owner].items.push(address.toString());
        snapshot.owners[owner].count = snapshot.owners[owner].items.length;
        await sleep(250);
    }
    const snapshotPath = `snapshot-${provider.network()}-${block.seqno}.json`;
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}
