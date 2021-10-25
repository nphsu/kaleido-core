import { parseEther } from '@ethersproject/units'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'
import { deployments, network, waffle } from 'hardhat'
import { getAdManagerABI } from '../scripts/common/file'
import { option } from '../scripts/common/wallet'
import { newMediaWith } from './MediaFactory.spec'
import { ADDRESS_ZERO } from './utils/address'
import {
  getAdManagerContract,
  getAdPoolContract,
  getEventEmitterContract,
  getMediaFactoryContract,
  getMediaRegistryContract,
  getNameRegistryContract,
} from './utils/setup'

describe('AdManager', async () => {
  const [user1, user2, user3] = waffle.provider.getWallets()

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    const now = Date.now()
    await network.provider.send('evm_setNextBlockTimestamp', [now])
    await network.provider.send('evm_mine')
    return {
      now: now,
      factory: await getMediaFactoryContract(),
      manager: await getAdManagerContract(),
      name: await getNameRegistryContract(),
      registry: await getMediaRegistryContract(),
      pool: await getAdPoolContract(),
      event: await getEventEmitterContract(),
    }
  })
  const _manager = (proxy: string) =>
    new ethers.Contract(proxy, getAdManagerABI(), user1)

  const managerInstance = async (
    factory: ethers.Contract,
    name: ethers.Contract
  ) => {
    const { proxy } = await newMediaWith(factory, name)
    return _manager(proxy)
  }

  describe('newSpace', async () => {
    it('should new an ad space', async () => {
      const { factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const spaceMetadata = 'asfafkjksjfkajf'

      expect(await manager.newSpace(spaceMetadata))
        .to.emit(event, 'NewSpace')
        .withArgs(spaceMetadata)
      expect(await manager.spaced(spaceMetadata)).to.be.true
    })

    it('should revert because the space has already created', async () => {
      const { factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const spaceMetadata = 'asfafkjksjfkajf'
      await manager.newSpace(spaceMetadata)

      await expect(manager.newSpace(spaceMetadata)).to.be.revertedWith('KD100')
    })
  })

  describe('newPeirod', async () => {
    it('should new an ad period', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const manager = await managerInstance(factory, name)
      const spaceMetadata = 'asfafkjksjfkajf'
      const tokenMetadata = 'poiknfknajnjaer'
      const saleEndTimestamp = now + 2400
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const pricing = 0
      const minPrice = parseEther('0.2')
      const tokenId = await manager.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )

      expect(
        await newPeriodWith(manager, {
          spaceMetadata: spaceMetadata,
          tokenMetadata: tokenMetadata,
          saleEndTimestamp: saleEndTimestamp,
          displayStartTimestamp: displayStartTimestamp,
          displayEndTimestamp: displayEndTimestamp,
          pricing: pricing,
          minPrice: minPrice,
        })
      )
        .to.emit(event, 'NewPeriod')
        .withArgs(
          tokenId,
          spaceMetadata,
          tokenMetadata,
          now + 2,
          saleEndTimestamp,
          displayStartTimestamp,
          displayEndTimestamp,
          pricing,
          minPrice
        )
      expect(await manager.spaced(spaceMetadata)).to.be.true
      expect(await manager.tokenIdsOf(spaceMetadata)).to.deep.equal([tokenId])
      expect(await manager.allPeriods(tokenId)).to.deep.equal([
        manager.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now + 2),
        BigNumber.from(saleEndTimestamp),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        minPrice,
        minPrice,
        false,
      ])
      expect(await manager.ownerOf(tokenId)).to.be.eq(manager.address)
      expect(await manager.tokenURI(tokenId)).to.be.eq(
        `https://base/${tokenMetadata}`
      )
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        manager.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now + 2),
        BigNumber.from(saleEndTimestamp),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        minPrice,
        minPrice,
        false,
      ])
    })

    it('should revert because the media is not yours', async () => {
      const { factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)

      await expect(newPeriodWith(manager.connect(user2))).to.be.revertedWith(
        'KD012'
      )
    })

    it('should revert because of overlapped period', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200

      await newPeriodWith(manager, {
        displayStartTimestamp: displayStartTimestamp,
        displayEndTimestamp: displayEndTimestamp,
      })
      await expect(
        newPeriodWith(manager, {
          displayStartTimestamp: now + 7100,
          displayEndTimestamp: now + 9000,
        })
      ).to.be.revertedWith('KD110')
    })

    it('should revert because the sale end time is the past', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const saleEndTimestamp = now - 1000

      await expect(
        newPeriodWith(manager, {
          saleEndTimestamp: saleEndTimestamp,
        })
      ).to.be.revertedWith('KD111')
    })

    it('should revert because the display start time is before the end of the sale', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const saleEndTimestamp = now + 3600
      const displayStartTimestamp = now + 2400
      const displayEndTimestamp = now + 7200

      await expect(
        newPeriodWith(manager, {
          saleEndTimestamp: saleEndTimestamp,
          displayStartTimestamp: displayStartTimestamp,
          displayEndTimestamp: displayEndTimestamp,
        })
      ).to.be.revertedWith('KD112')
    })

    it('should revert because the display end time is before the start of the display', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const displayStartTimestamp = now + 7200
      const displayEndTimestamp = now + 3600

      await expect(
        newPeriodWith(manager, {
          displayStartTimestamp: displayStartTimestamp,
          displayEndTimestamp: displayEndTimestamp,
        })
      ).to.be.revertedWith('KD113')
    })
  })

  describe('deletePeriod', async () => {
    it('should delete a period', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)
      await newPeriodWith(manager, { now })

      expect(await manager.deletePeriod(tokenId, option()))
        .to.emit(event, 'DeletePeriod')
        .withArgs(tokenId)
      await expect(manager.ownerOf(tokenId)).to.be.revertedWith('KD114')
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        ADDRESS_ZERO,
        '',
        '',
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        BigNumber.from(0),
        0,
        BigNumber.from(0),
        BigNumber.from(0),
        false,
      ])
    })

    it('should revert because of not existing', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      await newPeriodWith(manager, { now })
      await manager.deletePeriod(tokenId, option())
      await expect(manager.deletePeriod(tokenId, option())).to.be.revertedWith(
        'KD114'
      )
    })
  })

  describe('buy', async () => {
    it('should buy a period', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      expect(
        await buyWith(manager.connect(user2), {
          tokenId,
          value: price,
        })
      )
        .to.emit(event, 'Buy')
        .withArgs(tokenId, price, user2.address, now + 3)
    })

    it('should revert because the pricing is not RRP', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)
      const pricing = 1
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
      })

      await expect(
        buyWith(manager.connect(user2), {
          tokenId,
        })
      ).to.be.revertedWith('KD120')
    })

    it('should revert because it has already sold', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)
      const pricing = 0

      await newPeriodWith(manager, {
        now,
        pricing: pricing,
      })
      await buyWith(manager.connect(user2), {
        tokenId,
      })
      await expect(
        buyWith(manager.connect(user3), {
          tokenId,
        })
      ).to.be.revertedWith('KD121')
    })

    it('should revert because it has already sold', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)
      const pricing = 0
      const price = parseEther('0.3')

      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })
      await expect(
        buyWith(manager.connect(user2), {
          tokenId,
          value: parseEther('0.1'),
        })
      ).to.be.revertedWith('KD122')
    })
  })

  describe('buyBasedOnTime', async () => {
    it('should buy a period', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const pricing = 1
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      // 2400/3600 -> 66% passed
      await network.provider.send('evm_setNextBlockTimestamp', [now + 2400])
      await network.provider.send('evm_mine')

      const currentPrice = await manager.currentPrice(tokenId)

      // slightly passed for its operation
      await network.provider.send('evm_setNextBlockTimestamp', [now + 2460])
      await network.provider.send('evm_mine')

      expect(
        await manager
          .connect(user2)
          .buyBasedOnTime(tokenId, option({ value: currentPrice }))
      )
        .to.emit(event, 'Buy')
        .withArgs(tokenId, currentPrice, user2.address, now + 2461)
    })

    it('should revert because the pricing is not DPBT', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)
      const pricing = 2
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
      })

      const currentPrice = await manager.currentPrice(tokenId)
      await expect(
        manager
          .connect(user2)
          .buyBasedOnTime(tokenId, option({ value: currentPrice }))
      ).to.be.revertedWith('KD123')
    })
  })

  describe('bid', async () => {
    it('should bid', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      expect(
        await manager
          .connect(user2)
          .bid(tokenId, option({ value: parseEther('0.3') }))
      )
        .to.emit(event, 'Bid')
        .withArgs(tokenId, parseEther('0.3'), user2.address, now + 2)
    })

    it('should revert because it is not bidding', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      await expect(
        manager
          .connect(user2)
          .bid(tokenId, option({ value: parseEther('0.3') }))
      ).to.be.revertedWith('KD124')
    })
  })

  describe('receiveToken', async () => {
    it('should receive token by the successful bidder', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await manager
        .connect(user2)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      // passed the end timestamp of the sale
      await network.provider.send('evm_setNextBlockTimestamp', [now + 2410])
      await network.provider.send('evm_mine')

      expect(await manager.connect(user2).receiveToken(tokenId, option()))
        .to.emit(event, 'ReceiveToken')
        .withArgs(tokenId, parseEther('0.3'), user2.address, now + 5)
    })

    it('should revert because the caller is not the successful bidder', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await manager
        .connect(user2)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      // passed the end timestamp of the sale
      await network.provider.send('evm_setNextBlockTimestamp', [now + 2410])
      await network.provider.send('evm_mine')

      await expect(
        manager.connect(user3).receiveToken(tokenId, option())
      ).to.be.revertedWith('KD126')
    })

    it('should revert because the auction has not ended yet', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await manager
        .connect(user2)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      await expect(
        manager.connect(user2).receiveToken(tokenId, option())
      ).to.be.revertedWith('KD125')
    })
  })

  describe('withdraw', async () => {
    it('should withdraw the fund after a user bought', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(manager, {
        now,
        pricing: pricing,
        minPrice: price,
      })
      await buyWith(manager.connect(user2), {
        tokenId,
        value: price,
      })

      expect(await manager.withdraw())
        .to.emit(event, 'Withdraw')
        .withArgs(parseEther('0.18'))
    })
  })

  describe('propose', async () => {
    it('should propose to the right you bought', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })

      expect(
        await manager
          .connect(user2)
          .propose(tokenId, proposalMetadata, option())
      )
        .to.emit(event, 'Propose')
        .withArgs(tokenId, proposalMetadata)
      expect(await manager.proposed(tokenId)).to.be.eq(proposalMetadata)
    })

    it('should revert because the token is not yours', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })

      await expect(
        manager.connect(user3).propose(tokenId, proposalMetadata, option())
      ).to.be.revertedWith('KD012')
    })
  })

  describe('accept', async () => {
    it('should accept a proposal', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })
      await manager.connect(user2).propose(tokenId, proposalMetadata)

      expect(await manager.accept(tokenId, option()))
        .to.emit(event, 'AcceptProposal')
        .withArgs(tokenId, proposalMetadata)
    })

    it('should revert because it has already proposed', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })
      await manager.connect(user2).propose(tokenId, proposalMetadata)
      await manager.accept(tokenId, option())

      await expect(manager.accept(tokenId, option())).to.be.revertedWith(
        'KD130'
      )
    })
  })

  describe('deny', async () => {
    it('should deny a proposal', async () => {
      const { now, factory, name, event } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })
      await manager.connect(user2).propose(tokenId, proposalMetadata)

      const deniedReason =
        'This is a violence image a bit. We can not accept, sorry.'
      expect(await manager.deny(tokenId, deniedReason, option()))
        .to.emit(event, 'DenyProposal')
        .withArgs(tokenId, proposalMetadata, deniedReason)
    })

    it('should revert because there is not any proposals', async () => {
      const { now, factory, name } = await setupTests()
      const manager = await managerInstance(factory, name)
      const { tokenId } = await defaultPeriodProps(manager, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      const deniedReason =
        'This is a violence image a bit. We can not accept, sorry.'
      await newPeriodWith(manager, { now })
      await buyWith(manager.connect(user2), { tokenId })

      await expect(
        manager.deny(tokenId, deniedReason, option())
      ).to.be.revertedWith('KD130')
    })
  })
})

export type NewPeriodProps = {
  now?: number
  spaceMetadata?: string
  tokenMetadata?: string
  saleEndTimestamp?: number
  displayStartTimestamp?: number
  displayEndTimestamp?: number
  pricing?: number
  minPrice?: BigNumber
}

export const newPeriodWith = async (
  manager: ethers.Contract,
  props?: NewPeriodProps
) => {
  const now = props?.now ? props.now : Date.now()
  const defaults = await defaultPeriodProps(manager, now)
  return await manager.newPeriod(
    props?.spaceMetadata ? props.spaceMetadata : defaults.spaceMetadata,
    props?.tokenMetadata ? props.tokenMetadata : 'poiknfknajnjaer',
    props?.saleEndTimestamp
      ? props.saleEndTimestamp
      : defaults.saleEndTimestamp,
    props?.displayStartTimestamp
      ? props.displayStartTimestamp
      : defaults.displayStartTimestamp,
    props?.displayEndTimestamp
      ? props.displayEndTimestamp
      : defaults.displayEndTimestamp,
    props?.pricing ? props.pricing : 0,
    props?.minPrice ? props.minPrice : parseEther('0.1'),
    option()
  )
}

const defaultPeriodProps = async (manager: ethers.Contract, now: number) => {
  const spaceMetadata = 'abi09nadu2brasfjl'
  const saleEndTimestamp = now + 2400
  const displayStartTimestamp = now + 3600
  const displayEndTimestamp = now + 7200
  const tokenId = await manager.adId(
    spaceMetadata,
    displayStartTimestamp,
    displayEndTimestamp
  )
  return {
    spaceMetadata,
    saleEndTimestamp,
    displayStartTimestamp,
    displayEndTimestamp,
    tokenId,
  }
}

export type BuyProps = {
  tokenId: number
  value?: BigNumber
}

export const buyWith = async (manager: ethers.Contract, props: BuyProps) => {
  return await manager.buy(
    props.tokenId,
    option({ value: props.value ? props.value : parseEther('0.1') })
  )
}
