import { parseEther } from '@ethersproject/units'
import { expect } from 'chai'
import { BigNumber, ethers } from 'ethers'
import { deployments, network, waffle } from 'hardhat'
import {
  getMediaFacadeABI,
  getMockTimeMediaFacadeABI,
} from '../scripts/common/file'
import { option } from '../scripts/common/wallet'
import { newMediaWith } from './MediaFactory.spec'
import { ADDRESS_ZERO } from './utils/address'
import {
  getAdPoolContract,
  getEnglishAuctionContract,
  getEventEmitterContract,
  getMediaFactoryContract,
  getMediaRegistryContract,
  getNameRegistryContract,
  getOfferBidContract,
  getOpenBidContract,
  getProposalReviewContract,
  getVaultContract,
} from './utils/setup'

describe('MediaFacade', async () => {
  // user1: Deployer (Bridges)
  // user2: Media
  // user3: Buyer, Ad Owner
  // user4: Wrong others
  // user5: Another Media
  const [user1, user2, user3, user4, user5] = waffle.provider.getWallets()

  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    const now = Date.now()
    await network.provider.send('evm_setNextBlockTimestamp', [now])
    await network.provider.send('evm_mine')
    const pool = await getAdPoolContract()
    await pool.setTime(now)
    const eng = await getEnglishAuctionContract()
    await eng.setTime(now)
    const open = await getOpenBidContract()
    await open.setTime(now)

    return {
      now: now,
      factory: await getMediaFactoryContract(),
      name: await getNameRegistryContract(),
      registry: await getMediaRegistryContract(),
      pool: pool,
      eng: eng,
      open: open,
      review: await getProposalReviewContract(),
      offer: await getOfferBidContract(),
      event: await getEventEmitterContract(),
      vault: await getVaultContract(),
    }
  })
  const _facade = (proxy: string) =>
    new ethers.Contract(proxy, getMockTimeMediaFacadeABI(), user2)

  const facadeInstance = async (
    factory: ethers.Contract,
    name: ethers.Contract,
    now: number
  ) => {
    const { proxy } = await newMediaWith(user2, factory, name)
    const facade = _facade(proxy)
    await facade.setTime(now)
    return facade
  }

  describe('initialize', async () => {
    it('should initialize', async () => {
      const { now, factory, registry, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      expect(await facade.name()).to.be.eq('BridgesMedia')
      expect(await facade.symbol()).to.be.eq('Kaleido_BridgesMedia')
      expect(await facade.nameRegistryAddress()).to.be.eq(name.address)
      expect(await facade.ownerOf(0)).to.be.eq(user2.address)
      expect(await facade.tokenURI(0)).to.be.eq(
        `ipfs://asfajijij3rjiajwefjajkj;afsj`
      )
    })

    it('should not initialize twice', async () => {
      const { now, factory, registry, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      await expect(
        facade.initialize(
          'BridgesMedia',
          'ipfs://',
          'asfajijij3rjiajwefjajkj;afsj',
          user2.address,
          name.address
        )
      ).to.be.revertedWith('AR000')
    })
  })

  describe('updateMedia', async () => {
    it('should update a media', async () => {
      const { now, factory, registry, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const newMetadata = 'sfjjrtjwjtkljwlejr;tfjk'

      expect(await registry.allAccounts(facade.address)).to.deep.equal([
        facade.address,
        user2.address,
        'abi09nadu2brasfjl',
        '1eqe23kerfkamfka',
      ])
      expect(
        await facade.connect(user2).updateMedia(user4.address, newMetadata)
      )
        .to.emit(event, 'UpdateMedia')
        .withArgs(facade.address, user4.address, newMetadata)
      expect(await registry.allAccounts(facade.address)).to.deep.equal([
        facade.address,
        user4.address,
        'abi09nadu2brasfjl',
        newMetadata,
      ])
    })

    it('should revert because the sender is not the media EOA', async () => {
      const { now, factory, registry, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const newMetadata = 'sfjjrtjwjtkljwlejr;tfjk'

      await expect(
        facade.connect(user4).updateMedia(user4.address, newMetadata)
      ).to.be.revertedWith('KD012')
    })

    it('should revert because the EOA has changed to others', async () => {
      const { now, factory, registry, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const newMetadata = 'sfjjrtjwjtkljwlejr;tfjk'
      await facade.connect(user2).updateMedia(user4.address, newMetadata)

      await expect(
        facade.connect(user2).updateMedia(user4.address, newMetadata)
      ).to.be.revertedWith('KD012')
    })
  })

  describe('newSpace', async () => {
    it('should new an ad space', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const spaceMetadata = 'asfafkjksjfkajf'

      expect(await facade.newSpace(spaceMetadata, option()))
        .to.emit(event, 'NewSpace')
        .withArgs(spaceMetadata)
      expect(await pool.spaced(spaceMetadata)).to.be.true
    })

    it('should revert because the space has already created', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const spaceMetadata = 'asfafkjksjfkajf'
      await facade.newSpace(spaceMetadata)

      await expect(facade.newSpace(spaceMetadata)).to.be.revertedWith('KD100')
    })

    it('should revert because the space has already created by another media', async () => {
      const { now, factory, name } = await setupTests()
      const facade2 = await facadeInstance(factory, name, now)
      const { proxy } = await newMediaWith(user5, factory, name, {
        saltNonce: 100,
      })
      const facade5 = new ethers.Contract(proxy, getMediaFacadeABI(), user5)
      const spaceMetadata = 'asfafkjksjfkajf'
      await facade5.newSpace(spaceMetadata)

      await expect(facade2.newSpace(spaceMetadata)).to.be.revertedWith('KD100')
    })
  })

  describe('newPeirod', async () => {
    it('should new an ad period', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const spaceMetadata = 'asfafkjksjfkajf'
      const tokenMetadata = 'poiknfknajnjaer'
      const saleEndTimestamp = now + 2400
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const pricing = 0
      const minPrice = parseEther('0.2')
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )
      await facade.newSpace(spaceMetadata, option())
      expect(
        await newPeriodWith(facade, {
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
          now,
          saleEndTimestamp,
          displayStartTimestamp,
          displayEndTimestamp,
          pricing,
          minPrice
        )
        .to.emit(event, 'TransferCustom')
        .withArgs(ADDRESS_ZERO, facade.address, tokenId)
      expect(await pool.spaced(spaceMetadata)).to.be.true
      expect(await pool.tokenIdsOf(spaceMetadata)).to.deep.equal([tokenId])
      expect(await pool.periods(tokenId)).to.deep.equal([
        facade.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now),
        BigNumber.from(saleEndTimestamp),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        minPrice,
        minPrice,
        false,
      ])
      expect(await facade.ownerOf(tokenId)).to.be.eq(facade.address)
      expect(await facade.tokenURI(tokenId)).to.be.eq(`ipfs://${tokenMetadata}`)
    })

    it('should revert because the media is not yours', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      await expect(newPeriodWith(facade.connect(user4))).to.be.revertedWith(
        'KD012'
      )
    })

    it('should revert because of overlapped period', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const saleEndTimestamp = now + 2400
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200

      await newPeriodWith(facade, {
        saleEndTimestamp: saleEndTimestamp,
        displayStartTimestamp: displayStartTimestamp,
        displayEndTimestamp: displayEndTimestamp,
      })
      await expect(
        newPeriodWith(facade, {
          saleEndTimestamp: now + 5000,
          displayStartTimestamp: now + 7100,
          displayEndTimestamp: now + 9000,
        })
      ).to.be.revertedWith('KD110')
    })

    it('should revert because the sale end time is the past', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const saleEndTimestamp = now - 1000

      await expect(
        newPeriodWith(facade, {
          saleEndTimestamp: saleEndTimestamp,
        })
      ).to.be.revertedWith('KD111')
    })

    it('should revert because the display start time is before the end of the sale', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const saleEndTimestamp = now + 3600
      const displayStartTimestamp = now + 2400
      const displayEndTimestamp = now + 7200

      await expect(
        newPeriodWith(facade, {
          saleEndTimestamp: saleEndTimestamp,
          displayStartTimestamp: displayStartTimestamp,
          displayEndTimestamp: displayEndTimestamp,
        })
      ).to.be.revertedWith('KD112')
    })

    it('should revert because the display end time is before the start of the display', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const saleEndTimestamp = now + 2400
      const displayStartTimestamp = now + 7200
      const displayEndTimestamp = now + 3600

      await expect(
        newPeriodWith(facade, {
          saleEndTimestamp: saleEndTimestamp,
          displayStartTimestamp: displayStartTimestamp,
          displayEndTimestamp: displayEndTimestamp,
        })
      ).to.be.revertedWith('KD113')
    })
  })

  describe('deletePeriod', async () => {
    it('should delete a period', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)
      await newPeriodWith(facade, { now })

      expect((await pool.tokenIdsOf(spaceMetadata))[0]).to.be.eq(tokenId)
      expect(await facade.deletePeriod(tokenId, option()))
        .to.emit(event, 'DeletePeriod')
        .withArgs(tokenId)
        .to.emit(event, 'TransferCustom')
        .withArgs(facade.address, ADDRESS_ZERO, tokenId)
      await expect(facade.ownerOf(tokenId)).to.be.revertedWith('KD114')
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
      expect((await pool.tokenIdsOf(spaceMetadata))[0]).to.be.eq(
        BigNumber.from(0)
      )
    })

    it('should revert because it has already deleted', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      await newPeriodWith(facade, { now })
      await facade.deletePeriod(tokenId, option())
      await expect(facade.deletePeriod(tokenId, option())).to.be.revertedWith(
        'KD114'
      )
    })

    it('should revert because it has been sold out', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      await newPeriodWith(facade.connect(user2), { now })
      await buyWith(facade.connect(user3), {
        tokenId,
        value: parseEther('0.1'),
      })
      await expect(facade.deletePeriod(tokenId, option())).to.be.revertedWith(
        'KD121'
      )
    })

    it('should delete repeatedly', async () => {
      const { now, factory, name, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)
      await newPeriodWith(facade, { now })
      await facade.deletePeriod(tokenId, option())

      await newPeriodWith(facade, { now })
      await facade.deletePeriod(tokenId, option())

      await newPeriodWith(facade, { now })
      expect(await pool.tokenIdsOf(spaceMetadata)).to.deep.equal([
        BigNumber.from(0),
        BigNumber.from(0),
        tokenId,
      ])
    })

    it('should not delete because someone has already bid', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)
      await newPeriodWith(facade, { now, pricing: 2 })
      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      await expect(facade.deletePeriod(tokenId, option())).to.be.revertedWith(
        'KD128'
      )
    })

    it('should not delete because someone has already bid with a proposal', async () => {
      const { now, factory, name, event, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)
      await facade.newSpace(spaceMetadata, option())
      const metadata = '3wijisdkfj;alkjda'
      await newPeriodWith(facade, { now, pricing: 4 })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          metadata,
          option({ value: parseEther('0.3') })
        )

      await expect(facade.deletePeriod(tokenId, option())).to.be.revertedWith(
        'KD128'
      )
    })
  })

  describe('buy', async () => {
    it('should buy a period', async () => {
      const { now, factory, name, event, pool, vault } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const {
        tokenId,
        spaceMetadata,
        tokenMetadata,
        saleEndTimestamp,
        displayEndTimestamp,
        displayStartTimestamp,
      } = await defaultPeriodProps(facade, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      expect(
        await buyWith(facade.connect(user3), {
          tokenId,
          value: price,
        })
      )
        .to.emit(event, 'Buy')
        .withArgs(tokenId, price, user3.address, now)
        .to.emit(event, 'TransferCustom')
        .withArgs(facade.address, user3.address, tokenId)
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        facade.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now),
        BigNumber.from(saleEndTimestamp),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        price,
        price,
        true,
      ])
      expect(await facade.ownerOf(tokenId)).to.be.eq(user3.address)
      expect(await vault.balance()).to.be.eq(price.div(10))
    })

    it('should revert because the pricing is not RRP', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const pricing = 1
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
      })

      await expect(
        buyWith(facade.connect(user3), {
          tokenId,
        })
      ).to.be.revertedWith('KD120')
    })

    it('should revert because it has already sold', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const pricing = 0

      await newPeriodWith(facade, {
        now,
        pricing: pricing,
      })
      await buyWith(facade.connect(user3), {
        tokenId,
      })
      await expect(
        buyWith(facade.connect(user4), {
          tokenId,
        })
      ).to.be.revertedWith('KD121')
    })

    it('should revert because the price is wrong', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const pricing = 0
      const price = parseEther('0.3')

      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })
      await expect(
        buyWith(facade.connect(user3), {
          tokenId,
          value: parseEther('0.1'),
        })
      ).to.be.revertedWith('KD122')
    })

    it('should revert because the sender is the media EOA', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const pricing = 0
      const price = parseEther('0.3')

      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })
      await expect(
        buyWith(facade.connect(user2), {
          tokenId,
          value: parseEther('0.1'),
        })
      ).to.be.revertedWith('KD014')
    })
  })

  describe('buyBasedOnTime', async () => {
    it('should buy a period', async () => {
      const { now, factory, name, event, pool, vault } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const {
        tokenId,
        spaceMetadata,
        tokenMetadata,
        displayEndTimestamp,
        displayStartTimestamp,
      } = await defaultPeriodProps(facade, now)

      const pricing = 1
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: now + 3600,
        pricing: pricing,
        minPrice: price,
      })

      // 2400/3600 -> 66% passed
      await facade.setTime(now + 2400)
      await pool.setTime(now + 2400)

      const currentPrice = await pool.currentPrice(tokenId)

      // slightly passed for its operation
      await facade.setTime(now + 2460)
      await pool.setTime(now + 2460)

      expect(
        await facade
          .connect(user3)
          .buyBasedOnTime(tokenId, option({ value: currentPrice }))
      )
        .to.emit(event, 'Buy')
        .withArgs(tokenId, currentPrice, user3.address, now + 2460)
        .to.emit(event, 'TransferCustom')
        .withArgs(facade.address, user3.address, tokenId)
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        facade.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now),
        BigNumber.from(now + 3600),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        price,
        price.mul(10),
        true,
      ])
      expect(await facade.ownerOf(tokenId)).to.be.eq(user3.address)
      expect(await vault.balance()).to.be.eq(currentPrice.div(10))
    })

    it('should revert because the pricing is not DPBT', async () => {
      const { now, factory, name, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const pricing = 2
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
      })

      const currentPrice = await pool.currentPrice(tokenId)
      await expect(
        facade
          .connect(user3)
          .buyBasedOnTime(tokenId, option({ value: currentPrice }))
      ).to.be.revertedWith('KD123')
    })

    it('should revert because the sale has ended', async () => {
      const { now, factory, name, event, pool, vault } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const pricing = 1
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: now + 3600,
        pricing: pricing,
        minPrice: price,
      })

      // 4000/3600 -> over 100% passed
      await facade.setTime(now + 4000)
      await pool.setTime(now + 4000)

      const currentPrice = await pool.currentPrice(tokenId)
      await expect(
        facade
          .connect(user3)
          .buyBasedOnTime(tokenId, option({ value: currentPrice }))
      ).to.be.revertedWith('KD129')
    })
  })

  describe('bid', async () => {
    it('should bid by English Auction', async () => {
      const { now, factory, name, event, eng } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      expect(
        await facade
          .connect(user3)
          .bid(tokenId, option({ value: parseEther('0.3') }))
      )
        .to.emit(event, 'Bid')
        .withArgs(tokenId, parseEther('0.3'), user3.address, now)
      expect(await facade.balance()).to.be.eq(parseEther('0.3'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))
      expect(await eng.bidding(tokenId)).to.deep.equal([
        tokenId,
        user3.address,
        parseEther('0.3'),
      ])
    })

    it('should bid twice by two members', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))
      await facade
        .connect(user4)
        .bid(tokenId, option({ value: parseEther('0.45') }))

      expect(await facade.balance()).to.be.eq(parseEther('0.45'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))
    })

    it('should revert because it is not bidding', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })

      await expect(
        facade.connect(user3).bid(tokenId, option({ value: parseEther('0.3') }))
      ).to.be.revertedWith('KD124')
    })
  })

  describe('bidWithProposal', async () => {
    it('should bid with proposal', async () => {
      const { now, factory, name, event, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
      })

      expect(
        await facade
          .connect(user3)
          .bidWithProposal(
            tokenId,
            proposalMetadata,
            option({ value: parseEther('0.3') })
          )
      )
        .to.emit(event, 'BidWithProposal')
        .withArgs(
          tokenId,
          parseEther('0.3'),
          user3.address,
          proposalMetadata,
          now
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.25') })
        )
      expect(await facade.balance()).to.be.eq(parseEther('0.55'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))
      expect(await open.biddingList(tokenId)).to.deep.equal([
        [tokenId, user3.address, parseEther('0.3'), proposalMetadata],
        [tokenId, user4.address, parseEther('0.25'), proposalMetadata2],
      ])
    })

    it('should revert because it is not bidding with proposal', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'

      const wrongPricing = 2
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: wrongPricing,
        minPrice,
      })

      await expect(
        facade
          .connect(user3)
          .bidWithProposal(
            tokenId,
            proposalMetadata,
            option({ value: parseEther('0.3') })
          )
      ).to.be.revertedWith('KD127')
    })

    it('should revert because it is under the minimum price', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
      })

      await expect(
        facade
          .connect(user3)
          .bidWithProposal(
            tokenId,
            proposalMetadata,
            option({ value: parseEther('0.19') })
          )
      ).to.be.revertedWith('KD122')
    })
  })

  describe('selectProposal', async () => {
    it('should select a proposal', async () => {
      const { now, factory, name, event, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp } = await defaultPeriodProps(
        facade,
        now
      )
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.4') })
        )
      await facade.setTime(saleEndTimestamp + 1)
      await open.setTime(saleEndTimestamp + 1)

      expect(await facade.balance()).to.be.eq(parseEther('0.7'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))

      expect(
        await facade
          .connect(user2)
          .selectProposal(tokenId, 1, selectReason, option())
      )
        .to.emit(event, 'SelectProposal')
        .withArgs(tokenId, 1, user4.address, selectReason)
      expect(await facade.balance()).to.be.eq(parseEther('0.36'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.36'))
      expect(await open.biddingList(tokenId)).to.deep.equal([])
      expect(await open.reasons(tokenId)).to.be.eq(selectReason)
    })

    it('should select a proposal with 3 members', async () => {
      const { now, factory, name, event, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp } = await defaultPeriodProps(
        facade,
        now
      )
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const proposalMetadata3 = 'trkjsdfaj3aksjfaifasijfaji'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.4') })
        )

      const user5BeforeBid = await user5.getBalance()
      await facade
        .connect(user5)
        .bidWithProposal(
          tokenId,
          proposalMetadata3,
          option({ value: parseEther('0.2') })
        )
      const user5AfterBid = await user5.getBalance()
      expect(user5BeforeBid.sub(user5AfterBid)).to.be.gt(parseEther('0.20'))
      expect(user5BeforeBid.sub(user5AfterBid)).to.be.lt(parseEther('0.21'))

      await facade.setTime(saleEndTimestamp + 1)
      await open.setTime(saleEndTimestamp + 1)

      expect(await facade.balance()).to.be.eq(parseEther('0.9'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))

      await facade
        .connect(user2)
        .selectProposal(tokenId, 1, selectReason, option())
      const user5AfterRefunded = await user5.getBalance()
      expect(user5AfterRefunded.sub(user5AfterBid)).to.be.eq(parseEther('0.2'))
      expect(await facade.balance()).to.be.eq(parseEther('0.36'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.36'))
      expect(await open.biddingList(tokenId)).to.deep.equal([])
      expect(await open.reasons(tokenId)).to.be.eq(selectReason)
    })

    it('should not select a proposal because the auction still continues', async () => {
      const { now, factory, name, event, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp } = await defaultPeriodProps(
        facade,
        now
      )
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.25') })
        )
      await facade.setTime(saleEndTimestamp)
      await open.setTime(saleEndTimestamp)
      await expect(
        facade.connect(user2).selectProposal(tokenId, 1, selectReason, option())
      ).to.be.revertedWith('KD129')
    })

    it('should not select a proposal because of dubble actions', async () => {
      const { now, factory, name, event, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp } = await defaultPeriodProps(
        facade,
        now
      )
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.25') })
        )
      await facade.setTime(saleEndTimestamp + 1)
      await open.setTime(saleEndTimestamp + 1)
      await facade
        .connect(user2)
        .selectProposal(tokenId, 1, selectReason, option())
      await expect(
        facade.connect(user2).selectProposal(tokenId, 1, selectReason, option())
      ).to.be.revertedWith('KD114')
    })
  })

  describe('offerPeriod', async () => {
    it('should offer', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const spaceMetadata = 'asfafkjksjfkajf'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )
      const price = parseEther('0.4')
      await facade.connect(user2).newSpace(spaceMetadata)
      expect(
        await facade
          .connect(user3)
          .offerPeriod(
            spaceMetadata,
            displayStartTimestamp,
            displayEndTimestamp,
            option({ value: price })
          )
      )
        .to.emit(event, 'OfferPeriod')
        .withArgs(
          tokenId,
          spaceMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          user3.address,
          price
        )
    })

    it('should revert because of missing the space', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const wrongSpaceMetadata = 'asdfadfaweferhertheaeerwerafadfa'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const price = parseEther('0.4')
      await expect(
        facade
          .connect(user3)
          .offerPeriod(
            wrongSpaceMetadata,
            displayStartTimestamp,
            displayEndTimestamp,
            option({ value: price })
          )
      ).to.be.revertedWith('KD101')
    })
  })

  describe('cancelOffer', async () => {
    it('should cancel an offer', async () => {
      const { now, factory, name, event, offer } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const spaceMetadata = 'asfafkjksjfkajf'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )
      const price = parseEther('0.4')
      await facade.connect(user2).newSpace(spaceMetadata)
      await facade
        .connect(user3)
        .offerPeriod(
          spaceMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          option({ value: price })
        )
      expect(await facade.connect(user3).cancelOffer(tokenId, option()))
        .to.emit(event, 'CancelOffer')
        .withArgs(tokenId)
      expect(await offer.offered(tokenId)).to.deep.equal([
        '',
        BigNumber.from(0),
        BigNumber.from(0),
        ADDRESS_ZERO,
        BigNumber.from(0),
      ])
    })

    it('should revert because the offer is not yours', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const spaceMetadata = 'asfafkjksjfkajf'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )
      const price = parseEther('0.4')
      await facade.connect(user2).newSpace(spaceMetadata)
      await facade
        .connect(user3)
        .offerPeriod(
          spaceMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          option({ value: price })
        )
      await expect(
        facade.connect(user4).cancelOffer(tokenId, option())
      ).to.be.revertedWith('KD116')
    })
  })

  describe('acceptOffer', async () => {
    it('should accept an offer', async () => {
      const { now, factory, name, pool, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const spaceMetadata = 'abi09nadu2brasfjl'
      const tokenMetadata = 'poiknfknajnjaer'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp,
        displayEndTimestamp
      )
      const price = parseEther('0.4')
      await facade.newSpace(spaceMetadata)
      await facade
        .connect(user3)
        .offerPeriod(
          spaceMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          option({ value: price })
        )
      expect(await facade.balance()).to.be.eq(parseEther('0.4'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))

      expect(await facade.acceptOffer(tokenId, tokenMetadata, option()))
        .to.emit(event, 'AcceptOffer')
        .withArgs(
          tokenId,
          spaceMetadata,
          tokenMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          price
        )
      expect(await pool.tokenIdsOf(spaceMetadata)).to.deep.equal([tokenId])
      expect(await facade.balance()).to.be.eq(parseEther('0.36'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.36'))
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        user3.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now),
        BigNumber.from(now),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        3,
        price,
        price,
        true,
      ])
    })

    it('should revert because of the invalid tokenId', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)

      const spaceMetadata = 'abi09nadu2brasfjl'
      const tokenMetadata = 'poiknfknajnjaer'
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const wrongTokenId = await facade.adId(
        'asjkjkasjfkajkjfakjfkakdjak',
        displayStartTimestamp,
        displayEndTimestamp
      )
      const price = parseEther('0.4')
      await facade.newSpace(spaceMetadata)
      await facade
        .connect(user3)
        .offerPeriod(
          spaceMetadata,
          displayStartTimestamp,
          displayEndTimestamp,
          option({ value: price })
        )
      await expect(
        facade.acceptOffer(wrongTokenId, tokenMetadata, option())
      ).to.be.revertedWith('KD115')
    })

    it('should revert because the period has already bought and overlapped', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const spaceMetadata = 'asfafkjksjfkajf'
      const tokenMetadata = 'poiknfknajnjaer'
      const saleEndTimestamp = now + 2400
      const displayStartTimestamp = now + 3600
      const displayEndTimestamp = now + 7200
      const pricing = 0
      const minPrice = parseEther('0.2')
      const tokenId = await facade.adId(
        spaceMetadata,
        displayStartTimestamp + 1000,
        displayEndTimestamp + 1000
      )

      const price = parseEther('0.4')
      await newPeriodWith(facade.connect(user2), {
        spaceMetadata: spaceMetadata,
        tokenMetadata: tokenMetadata,
        saleEndTimestamp: saleEndTimestamp,
        displayStartTimestamp: displayStartTimestamp,
        displayEndTimestamp: displayEndTimestamp,
        pricing: pricing,
        minPrice: minPrice,
      })
      await facade
        .connect(user3)
        .offerPeriod(
          spaceMetadata,
          displayStartTimestamp + 1000,
          displayEndTimestamp + 1000,
          option({ value: price })
        )

      await expect(
        facade.connect(user2).acceptOffer(tokenId, tokenMetadata, option())
      ).to.be.revertedWith('KD110')
    })
  })

  describe('receiveToken', async () => {
    it('should receive token by the successful bidder', async () => {
      const { now, factory, name, event, eng, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const {
        tokenId,
        spaceMetadata,
        tokenMetadata,
        displayStartTimestamp,
        displayEndTimestamp,
      } = await defaultPeriodProps(facade, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      expect(await facade.balance()).to.be.eq(parseEther('0.3'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))

      // passed the end timestamp of the sale
      await facade.setTime(now + 2410)
      await eng.setTime(now + 2410)

      expect(await facade.connect(user3).receiveToken(tokenId, option()))
        .to.emit(event, 'ReceiveToken')
        .withArgs(tokenId, parseEther('0.3'), user3.address, now + 2410)
        .to.emit(event, 'TransferCustom')
        .withArgs(facade.address, user3.address, tokenId)
      expect(await pool.allPeriods(tokenId)).to.deep.equal([
        facade.address,
        spaceMetadata,
        tokenMetadata,
        BigNumber.from(now),
        BigNumber.from(saleEndTimestamp),
        BigNumber.from(displayStartTimestamp),
        BigNumber.from(displayEndTimestamp),
        pricing,
        price,
        price,
        true,
      ])
      expect(await facade.ownerOf(tokenId)).to.be.eq(user3.address)
      expect(await facade.balance()).to.be.eq(parseEther('0.27'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.27'))
    })

    it('should revert because the caller is not the successful bidder', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      // passed the end timestamp of the sale
      await facade.setTime(now + 2410)

      await expect(
        facade.connect(user4).receiveToken(tokenId, option())
      ).to.be.revertedWith('KD126')
    })

    it('should revert because the auction has not ended yet', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      await expect(
        facade.connect(user3).receiveToken(tokenId, option())
      ).to.be.revertedWith('KD125')
    })
  })

  describe('pushToSuccessfulBidder', async () => {
    it('should push a token to the successful bidder', async () => {
      const { now, factory, name, event, eng } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const saleEndTimestamp = now + 2400
      const pricing = 2
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        saleEndTimestamp: saleEndTimestamp,
        pricing: pricing,
        minPrice: price,
      })
      await facade
        .connect(user3)
        .bid(tokenId, option({ value: parseEther('0.3') }))

      expect(await facade.balance()).to.be.eq(parseEther('0.3'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))

      // passed the end timestamp of the sale
      await facade.setTime(now + 2410)
      await eng.setTime(now + 2410)

      expect(
        await facade.connect(user2).pushToSuccessfulBidder(tokenId, option())
      )
        .to.emit(event, 'ReceiveToken')
        .withArgs(tokenId, parseEther('0.3'), user3.address, now + 2410)
        .to.emit(event, 'TransferCustom')
        .withArgs(facade.address, user3.address, tokenId)
      expect(await facade.balance()).to.be.eq(parseEther('0.27'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.27'))
      expect(await facade.ownerOf(tokenId)).to.be.eq(user3.address)
    })
  })

  describe('withdraw', async () => {
    it('should withdraw the fund after a user bought', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const pricing = 0
      const price = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing: pricing,
        minPrice: price,
      })
      await buyWith(facade.connect(user3), {
        tokenId,
        value: price,
      })

      expect(await facade.balance()).to.be.eq(parseEther('0.18'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0.18'))
      expect(await facade.withdraw())
        .to.emit(event, 'Withdraw')
        .withArgs(parseEther('0.18'))
      expect(await facade.balance()).to.be.eq(parseEther('0'))
      expect(await facade.withdrawalAmount()).to.be.eq(parseEther('0'))
    })
  })

  describe('propose', async () => {
    it('should propose to the right you bought', async () => {
      const { now, factory, name, event, review } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })

      expect(
        await facade.connect(user3).propose(tokenId, proposalMetadata, option())
      )
        .to.emit(event, 'Propose')
        .withArgs(tokenId, proposalMetadata)
      expect(await review.proposed(tokenId)).to.deep.equal([
        proposalMetadata,
        user3.address,
      ])
    })

    it('should propose multiple times', async () => {
      const { now, factory, name, event, review } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      const proposalMetadata2 = 'sfko4tesrgjskrwjiwtd'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })

      await facade.connect(user3).propose(tokenId, proposalMetadata, option())
      await facade.connect(user3).propose(tokenId, proposalMetadata2, option())

      expect(await review.proposed(tokenId)).to.deep.equal([
        proposalMetadata2,
        user3.address,
      ])
    })

    it('should revert because the token is not yours', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })

      await expect(
        facade.connect(user4).propose(tokenId, proposalMetadata, option())
      ).to.be.revertedWith('KD012')
    })

    it('should revert because the proposal was accepted', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)
      await facade.acceptProposal(tokenId, option())

      await expect(
        facade.connect(user3).propose(tokenId, proposalMetadata)
      ).to.be.revertedWith('KD132')
    })
  })

  describe('acceptProposal', async () => {
    it('should accept a proposal', async () => {
      const { now, factory, name, event, review } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)

      expect(await facade.acceptProposal(tokenId, option()))
        .to.emit(event, 'AcceptProposal')
        .withArgs(tokenId, proposalMetadata)
      expect(await review.proposed(tokenId)).to.deep.equal(['', user3.address])
      expect(await facade.ownerOf(tokenId)).to.be.eq(user3.address)
    })

    it('should revert because it has already proposed', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)
      await facade.acceptProposal(tokenId, option())

      await expect(facade.acceptProposal(tokenId, option())).to.be.revertedWith(
        'KD130'
      )
    })

    it('should revert because the token has transferred to others', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)
      await facade
        .connect(user3)
        .transferFrom(user3.address, user4.address, tokenId)

      await expect(facade.acceptProposal(tokenId, option())).to.be.revertedWith(
        'KD131'
      )
    })
  })

  describe('denyProposal', async () => {
    it('should deny a proposal', async () => {
      const { now, factory, name, event } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)

      const deniedReason =
        'This is a violence image a bit. We can not accept, sorry.'
      const offensive = true
      expect(
        await facade.denyProposal(tokenId, deniedReason, offensive, option())
      )
        .to.emit(event, 'DenyProposal')
        .withArgs(tokenId, proposalMetadata, deniedReason, offensive)
    })

    it('should revert because there is not any proposals', async () => {
      const { now, factory, name } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId } = await defaultPeriodProps(facade, now)

      const deniedReason =
        'This is a violence image a bit. We can not accept, sorry.'
      const offensive = true
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })

      await expect(
        facade.denyProposal(tokenId, deniedReason, offensive, option())
      ).to.be.revertedWith('KD130')
    })
  })

  describe('display', async () => {
    it('should display when being bought by fixed price', async () => {
      const { now, factory, name, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)
      await facade.acceptProposal(tokenId, option())

      // passed to the start of displaying
      await facade.setTime(now + 4000)
      await pool.setTime(now + 4000)

      expect(await pool.display(spaceMetadata)).to.deep.equal([
        proposalMetadata,
        tokenId,
      ])
    })

    it('should not display before it starts', async () => {
      const { now, factory, name, pool } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, spaceMetadata } = await defaultPeriodProps(facade, now)

      const proposalMetadata = 'asfdjakjajk3rq35jqwejrqk'
      await newPeriodWith(facade, { now })
      await buyWith(facade.connect(user3), { tokenId })
      await facade.connect(user3).propose(tokenId, proposalMetadata)
      await facade.acceptProposal(tokenId, option())

      expect(await pool.display(spaceMetadata)).to.deep.equal([
        '',
        BigNumber.from(0),
      ])
    })

    it('should display when being bought by an oepn bidding', async () => {
      const { now, factory, name, pool, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp, spaceMetadata } =
        await defaultPeriodProps(facade, now)
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.4') })
        )
      await facade.setTime(saleEndTimestamp + 1)
      await open.setTime(saleEndTimestamp + 1)
      await facade
        .connect(user2)
        .selectProposal(tokenId, 1, selectReason, option())

      // passed to the start of displaying
      await facade.setTime(now + 4000)
      await pool.setTime(now + 4000)

      expect(await pool.display(spaceMetadata)).to.deep.equal([
        proposalMetadata2,
        tokenId,
      ])
    })

    it('should not display before it starts', async () => {
      const { now, factory, name, pool, open } = await setupTests()
      const facade = await facadeInstance(factory, name, now)
      const { tokenId, saleEndTimestamp, spaceMetadata } =
        await defaultPeriodProps(facade, now)
      const proposalMetadata = '3j34tw3jtwkejjauuwdsfj;lksja'
      const proposalMetadata2 = 'asfdjaij34rwerak13rwkeaj;lksja'
      const selectReason = 'sfkajijwejlaksjfajljakljdsaj'

      const pricing = 4
      const minPrice = parseEther('0.2')
      await newPeriodWith(facade, {
        now,
        pricing,
        minPrice,
        saleEndTimestamp,
      })
      await facade
        .connect(user3)
        .bidWithProposal(
          tokenId,
          proposalMetadata,
          option({ value: parseEther('0.3') })
        )
      await facade
        .connect(user4)
        .bidWithProposal(
          tokenId,
          proposalMetadata2,
          option({ value: parseEther('0.4') })
        )
      await facade.setTime(saleEndTimestamp + 1)
      await open.setTime(saleEndTimestamp + 1)
      await facade
        .connect(user2)
        .selectProposal(tokenId, 1, selectReason, option())

      expect(await pool.display(spaceMetadata)).to.deep.equal([
        '',
        BigNumber.from(0),
      ])
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
  facade: ethers.Contract,
  props?: NewPeriodProps
) => {
  const now = props?.now ? props.now : Date.now()
  const defaults = await defaultPeriodProps(facade, now)
  return await facade.newPeriod(
    props?.spaceMetadata ? props.spaceMetadata : defaults.spaceMetadata,
    props?.tokenMetadata ? props.tokenMetadata : defaults.tokenMetadata,
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

const defaultPeriodProps = async (facade: ethers.Contract, now: number) => {
  const spaceMetadata = 'abi09nadu2brasfjl'
  const tokenMetadata = 'poiknfknajnjaer'
  const saleEndTimestamp = now + 2400
  const displayStartTimestamp = now + 3600
  const displayEndTimestamp = now + 7200
  const tokenId = await facade.adId(
    spaceMetadata,
    displayStartTimestamp,
    displayEndTimestamp
  )
  return {
    spaceMetadata,
    tokenMetadata,
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

export const buyWith = async (facade: ethers.Contract, props: BuyProps) => {
  return await facade.buy(
    props.tokenId,
    option({ value: props.value ? props.value : parseEther('0.1') })
  )
}
