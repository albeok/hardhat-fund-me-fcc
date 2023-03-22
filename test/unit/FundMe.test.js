const { deployments, getNamedAccounts, ethers } = require("hardhat");
const { assert, expect } = require("chai");
!developmentChains.includes(network.name)
    ? describe.skip :
    describe("FundMe", async () => {
        let fundMe;
        let deployer;
        let mockV3Aggregator;
        const sendValue = "1000000000000000000" // 1 ETH

        beforeEach(async () => {
            // const accounts = await ethers.getSigners()
            // deployer = accounts[0]
            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            fundMe = await ethers.getContract("FundMe", deployer)
            mockV3Aggregator = await ethers.getContract(
                "MockV3Aggregator",
                deployer
            )
        })

        describe("constructor", async () => {
            it("sets the aggregator addresses correctly", async () => {
                const response = await fundMe.getPriceFeed();
                assert.equal(response, mockV3Aggregator.address);
            });
        });
        describe("fund", async () => {

            it("fails if you don't send enough ETH", async () => {
                await expect(fundMe.fund()).to.be.revertedWith("You need to spend more ETH!");
            });

            it("Updates the amount funded data structure", async () => {
                await fundMe.fund({ value: sendValue })
                const response = await fundMe.getAddressToAmountFunded(deployer)
                assert.equal(response.toString(), sendValue.toString())
            })
            it("adds funder to array funders", async () => {
                await fundMe.fund({ value: sendValue })
                const funder = await fundMe.getFunder(0)
                assert.equal(funder, deployer)
            })
        });
        describe("withdraw", async () => {
            beforeEach(async () => {
                await fundMe.fund({ value: sendValue });
            });
            it("withdraw ETH from a single founder", async () => {
                const startingFundMeBalance = await fundMe.provider.getBalance(fundMe.address);
                const startingDeployerBalance = await fundMe.provider.getBalance(deployer);
                const transactionResponse = await fundMe.withdraw();
                const transactionReceipt = await transactionResponse.wait(1);
                const { gasUsed, effectiveGasPrice } = transactionReceipt
                const gasCost = gasUsed.mul(effectiveGasPrice)
                const endingFundMeBalance = await fundMe.provider.getBalance(fundMe.address);
                const endingDeployerBalance = await fundMe.provider.getBalance(deployer);
                assert(endingFundMeBalance, 0);
                assert(startingDeployerBalance.add(startingFundMeBalance), endingDeployerBalance.add(gasCost).toString());
            });
            it("is allows us to withdraw with multiple funders", async () => {
                // Arrange
                const accounts = await ethers.getSigners()
                for (i = 1; i < 6; i++) {
                    const fundMeConnectedContract = await fundMe.connect(
                        accounts[i]
                    )
                    await fundMeConnectedContract.fund({ value: sendValue })
                }
                const startingFundMeBalance =
                    await fundMe.provider.getBalance(fundMe.address)
                const startingDeployerBalance =
                    await fundMe.provider.getBalance(deployer)

                // Act
                const transactionResponse = await fundMe.cheaperWithdraw()
                // Let's comapre gas costs :)
                // const transactionResponse = await fundMe.withdraw()
                const transactionReceipt = await transactionResponse.wait()
                const { gasUsed, effectiveGasPrice } = transactionReceipt
                const withdrawGasCost = gasUsed.mul(effectiveGasPrice)
                console.log(`GasCost: ${withdrawGasCost}`)
                console.log(`GasUsed: ${gasUsed}`)
                console.log(`GasPrice: ${effectiveGasPrice}`)
                const endingFundMeBalance = await fundMe.provider.getBalance(
                    fundMe.address
                )
                const endingDeployerBalance =
                    await fundMe.provider.getBalance(deployer)
                // Assert
                assert.equal(
                    startingFundMeBalance
                        .add(startingDeployerBalance)
                        .toString(),
                    endingDeployerBalance.add(withdrawGasCost).toString()
                )
                // Make a getter for storage variables
                await expect(fundMe.getFunder(0)).to.be.reverted

                for (i = 1; i < 6; i++) {
                    assert.equal(
                        await fundMe.getAddressToAmountFunded(
                            accounts[i].address
                        ),
                        0
                    )
                }
            });
            it("allows only the owner to withdraw", async () => {
                const accounts = ethers.getSigner();
                const attacker = accounts[1];
                const attackerConnectedContract = await fundMe.connect(attacker);
                expect(attackerConnectedContract.withdraw()).to.be.revertedWith("FundMe__NotOwner");
            })
        });
    });
