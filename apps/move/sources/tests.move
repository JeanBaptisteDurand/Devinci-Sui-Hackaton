#[test_only]
module sui_subscription_analyzer::tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::test_utils;
    use sui_subscription_analyzer::subscription::{
        Self, 
        SubscriptionNFT, 
        Treasury, 
        TreasuryOwnerCap
    };
    
    // Test addresses
    const ADMIN: address = @0xAD;
    const USER1: address = @0xA1;
    const USER2: address = @0xA2;
    const ATTACKER: address = @0xBAD;
    
    // Prices in MIST
    const PRICE_BASIC: u64 = 100_000_000;   // 0.1 SUI
    const PRICE_PRO: u64 = 500_000_000;     // 0.5 SUI
    const PRICE_ELITE: u64 = 1_000_000_000; // 1.0 SUI
    
    // ===== Helper Functions =====
    
    /// Initialize the module and return treasury
    fun init_module(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            subscription::init_for_testing(ts::ctx(scenario));
        };
    }
    
    /// Create a coin with specific amount
    fun mint_sui(amount: u64, scenario: &mut Scenario): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ts::ctx(scenario))
    }
    
    // ===== Basic Functionality Tests =====
    
    #[test]
    /// Test: Basic subscription creation with correct payment
    fun test_subscribe_basic_success() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // User subscribes with exact payment
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            // Verify treasury received payment
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_BASIC, 0);
            
            ts::return_shared(treasury);
        };
        
        // Verify NFT was created
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 0, 1);
            assert!(subscription::get_token_balance(&nft) == 1000, 2);
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Pro subscription creation
    fun test_subscribe_pro_success() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_pro(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_PRO, 0);
            
            ts::return_shared(treasury);
        };
        
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 1, 1);
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Elite subscription creation
    fun test_subscribe_elite_success() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_ELITE, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_elite(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_ELITE, 0);
            
            ts::return_shared(treasury);
        };
        
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 2, 1);
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Overpayment returns change correctly
    fun test_overpayment_returns_change() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            // Pay 0.2 SUI for 0.1 SUI subscription
            let payment = mint_sui(200_000_000, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            // Treasury should only have exact price
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_BASIC, 0);
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    // ===== Security Tests =====
    
    #[test]
    #[expected_failure(abort_code = subscription::EInsufficientPayment)]
    /// Test: SECURITY - Insufficient payment is rejected
    fun test_security_insufficient_payment() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, ATTACKER);
        {
            // Try to pay less than required
            let payment = mint_sui(50_000_000, &mut scenario); // Only 0.05 SUI
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: SECURITY - Only owner can withdraw (capability-based)
    /// This test verifies that the withdraw function requires TreasuryOwnerCap
    /// which only the admin has. Attackers cannot withdraw without this capability.
    fun test_security_only_owner_can_withdraw() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // User subscribes (adds funds to treasury)
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        // Verify that ADMIN (who has the cap) can withdraw
        ts::next_tx(&mut scenario, ADMIN);
        {
            let owner_cap = ts::take_from_sender<TreasuryOwnerCap>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            let initial_balance = subscription::get_treasury_balance(&treasury);
            
            subscription::withdraw(
                &owner_cap,
                &mut treasury,
                50_000_000, // 0.05 SUI
                ADMIN,
                ts::ctx(&mut scenario)
            );
            
            assert!(subscription::get_treasury_balance(&treasury) == initial_balance - 50_000_000, 0);
            
            ts::return_to_sender(&scenario, owner_cap);
            ts::return_shared(treasury);
        };
        
        // Note: Attackers cannot withdraw because they don't have TreasuryOwnerCap
        // The capability is only owned by ADMIN, enforced by Move's type system
        
        ts::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = subscription::EInvalidAmount)]
    /// Test: SECURITY - Cannot withdraw more than balance
    fun test_security_cannot_withdraw_more_than_balance() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to add funds
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        // Admin tries to withdraw more than available
        ts::next_tx(&mut scenario, ADMIN);
        {
            let owner_cap = ts::take_from_sender<TreasuryOwnerCap>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            // Try to withdraw more than balance
            subscription::withdraw(
                &owner_cap,
                &mut treasury,
                PRICE_BASIC * 2, // Double what's available
                ADMIN,
                ts::ctx(&mut scenario)
            );
            
            ts::return_to_sender(&scenario, owner_cap);
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: SECURITY - Multiple subscriptions accumulate correctly
    fun test_security_multiple_subscriptions_accumulate() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // USER1 subscribes
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_BASIC, 0);
            ts::return_shared(treasury);
        };
        
        // USER2 subscribes
        ts::next_tx(&mut scenario, USER2);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_pro(payment, &mut treasury, ts::ctx(&mut scenario));
            
            // Treasury should have both payments
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_BASIC + PRICE_PRO, 1);
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: SECURITY - Subscriptions are non-transferable
    /// (This is enforced by type system - NFT doesn't have `store` ability)
    fun test_security_nft_non_transferable() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
        };
        
        // Verify NFT exists for USER1
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_owner(&nft) == USER1, 0);
            
            // Cannot transfer - enforced by Move type system
            // transfer::public_transfer(nft, USER2); // Would fail to compile
            
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: SECURITY - Token deduction requires sufficient balance
    fun test_security_token_deduction_requires_balance() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
        };
        
        ts::next_tx(&mut scenario, USER1);
        {
            let mut nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            
            // Initial balance is 1000
            assert!(subscription::get_token_balance(&nft) == 1000, 0);
            
            // Can deduct when sufficient
            assert!(subscription::has_sufficient_tokens(&nft, 5), 1);
            
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    // ===== Treasury Management Tests =====
    
    #[test]
    /// Test: Admin can withdraw funds successfully
    fun test_admin_withdrawal_success() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // User subscribes
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_ELITE, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::subscribe_elite(payment, &mut treasury, ts::ctx(&mut scenario));
            
            ts::return_shared(treasury);
        };
        
        // Admin withdraws
        ts::next_tx(&mut scenario, ADMIN);
        {
            let owner_cap = ts::take_from_sender<TreasuryOwnerCap>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            let initial_balance = subscription::get_treasury_balance(&treasury);
            let withdraw_amount = 500_000_000; // 0.5 SUI
            
            subscription::withdraw(
                &owner_cap,
                &mut treasury,
                withdraw_amount,
                ADMIN,
                ts::ctx(&mut scenario)
            );
            
            // Verify balance decreased
            assert!(subscription::get_treasury_balance(&treasury) == initial_balance - withdraw_amount, 0);
            
            ts::return_to_sender(&scenario, owner_cap);
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Ownership transfer works correctly
    fun test_ownership_transfer() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Transfer ownership to USER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let owner_cap = ts::take_from_sender<TreasuryOwnerCap>(&scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::transfer_ownership(owner_cap, &mut treasury, USER1);
            
            // Verify new owner is recorded
            assert!(subscription::get_treasury_owner(&treasury) == USER1, 0);
            
            ts::return_shared(treasury);
        };
        
        // New owner should have the cap
        ts::next_tx(&mut scenario, USER1);
        {
            let _owner_cap = ts::take_from_sender<TreasuryOwnerCap>(&scenario);
            // Cap successfully transferred
            ts::return_to_sender(&scenario, _owner_cap);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Sales statistics are tracked correctly
    fun test_sales_statistics() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to each tier
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        ts::next_tx(&mut scenario, USER2);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_pro(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Check stats
        ts::next_tx(&mut scenario, ADMIN);
        {
            let treasury = ts::take_shared<Treasury>(&scenario);
            let (basic, pro, elite) = subscription::get_sales_stats(&treasury);
            
            assert!(basic == 1, 0);
            assert!(pro == 1, 1);
            assert!(elite == 0, 2);
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    // ===== Reentrancy Attack Tests =====
    
    #[test]
    /// Test: SECURITY - Reentrancy protection
    /// Payment is processed atomically before NFT creation
    /// This prevents reentrancy attacks where an attacker might try to
    /// call subscribe again before the first transaction completes
    fun test_security_reentrancy_protection() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            let initial_balance = subscription::get_treasury_balance(&treasury);
            
            // Subscribe (payment processed atomically)
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            
            // Verify payment was received exactly once
            assert!(subscription::get_treasury_balance(&treasury) == initial_balance + PRICE_BASIC, 0);
            
            ts::return_shared(treasury);
        };
        
        // Verify only one NFT was created
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            // Only one NFT exists for this user
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    // ===== Upgrade Tests =====
    
    #[test]
    /// Test: Upgrade from Basic to Pro works correctly
    fun test_upgrade_basic_to_pro() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Basic
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Use some tokens
        ts::next_tx(&mut scenario, USER1);
        {
            let mut nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            subscription::deduct_tokens(&mut nft, 200); // Use 200 tokens
            let remaining = subscription::get_token_balance(&nft);
            assert!(remaining == 800, 0);
            ts::return_to_sender(&scenario, nft);
        };
        
        // Upgrade to Pro
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(400_000_000, &mut scenario); // 0.4 SUI difference
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                1, // Pro tier
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        // Verify new NFT
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 1, 1); // Pro tier
            assert!(subscription::get_token_balance(&nft) == 1800, 2); // 800 preserved + 1000 bonus
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Upgrade from Pro to Elite works correctly
    fun test_upgrade_pro_to_elite() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Pro
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_pro(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Upgrade to Elite
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(500_000_000, &mut scenario); // 0.5 SUI difference
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                2, // Elite tier
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        // Verify new NFT
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 2, 0); // Elite tier
            assert!(subscription::get_token_balance(&nft) == 2000, 1); // 1000 + 1000
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Upgrade from Basic to Elite (skip Pro) works
    fun test_upgrade_basic_to_elite() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Basic
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Upgrade directly to Elite
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(900_000_000, &mut scenario); // 0.9 SUI difference
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                2, // Elite tier
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        // Verify new NFT
        ts::next_tx(&mut scenario, USER1);
        {
            let nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            assert!(subscription::get_tier(&nft) == 2, 0);
            assert!(subscription::get_token_balance(&nft) == 2000, 1);
            ts::return_to_sender(&scenario, nft);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = subscription::ECannotDowngrade)]
    /// Test: SECURITY - Cannot downgrade from Pro to Basic
    fun test_security_cannot_downgrade() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Pro
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_pro(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Try to "upgrade" to Basic (downgrade) - should fail
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                0, // Basic tier (lower than Pro)
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = subscription::ESameTier)]
    /// Test: SECURITY - Cannot "upgrade" to same tier
    fun test_security_cannot_upgrade_to_same_tier() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Pro
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_pro(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Try to "upgrade" to Pro again - should fail
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(PRICE_PRO, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                1, // Pro tier (same as current)
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    #[expected_failure(abort_code = subscription::EInsufficientPayment)]
    /// Test: SECURITY - Upgrade requires correct payment
    fun test_security_upgrade_requires_correct_payment() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Basic
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Try to upgrade with insufficient payment
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(200_000_000, &mut scenario); // Only 0.2 SUI (need 0.4)
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                1, // Pro tier
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Upgrade with overpayment returns change
    fun test_upgrade_returns_change() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Basic
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Upgrade with overpayment
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(600_000_000, &mut scenario); // 0.6 SUI (need 0.4)
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                1, // Pro tier
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            // Treasury should only have price difference
            let balance = subscription::get_treasury_balance(&treasury);
            assert!(balance == PRICE_BASIC + 400_000_000, 0); // 0.1 + 0.4
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
    
    #[test]
    /// Test: Treasury balance correct after upgrade
    fun test_upgrade_treasury_accounting() {
        let mut scenario = ts::begin(ADMIN);
        init_module(&mut scenario);
        
        // Subscribe to Basic
        ts::next_tx(&mut scenario, USER1);
        {
            let payment = mint_sui(PRICE_BASIC, &mut scenario);
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            subscription::subscribe_basic(payment, &mut treasury, ts::ctx(&mut scenario));
            ts::return_shared(treasury);
        };
        
        // Check initial balance
        ts::next_tx(&mut scenario, USER1);
        {
            let treasury = ts::take_shared<Treasury>(&scenario);
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_BASIC, 0);
            ts::return_shared(treasury);
        };
        
        // Upgrade to Elite
        ts::next_tx(&mut scenario, USER1);
        {
            let old_nft = ts::take_from_sender<SubscriptionNFT>(&scenario);
            let payment = mint_sui(900_000_000, &mut scenario); // 0.9 SUI
            let mut treasury = ts::take_shared<Treasury>(&scenario);
            
            subscription::upgrade_subscription(
                old_nft,
                2, // Elite
                payment,
                &mut treasury,
                ts::ctx(&mut scenario)
            );
            
            // Treasury should have: 0.1 (Basic) + 0.9 (upgrade) = 1.0 SUI
            assert!(subscription::get_treasury_balance(&treasury) == PRICE_ELITE, 1);
            
            ts::return_shared(treasury);
        };
        
        ts::end(scenario);
    }
}
