module sui_subscription_analyzer::subscription {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};

    // ===== Constants =====
    
    // Subscription tiers
    const TIER_BASIC: u8 = 0;
    const TIER_PRO: u8 = 1;
    const TIER_ELITE: u8 = 2;
    
    // Default token balance for new subscriptions
    const DEFAULT_TOKEN_BALANCE: u64 = 1000;
    
    // Subscription prices in MIST (1 SUI = 1,000,000,000 MIST)
    const PRICE_BASIC: u64 = 100_000_000;    // 0.1 SUI
    const PRICE_PRO: u64 = 500_000_000;      // 0.5 SUI
    const PRICE_ELITE: u64 = 1_000_000_000;  // 1.0 SUI
    
    // ===== Error Codes =====
    
    const EInsufficientTokens: u64 = 100;
    const EInsufficientPayment: u64 = 101;
    const EUnauthorized: u64 = 102;
    const EInvalidAmount: u64 = 103;
    const ECannotDowngrade: u64 = 104;
    const EInvalidTier: u64 = 105;
    const ESameTier: u64 = 106;
    
    // ===== Structs =====
    
    /// Subscription NFT structure
    /// - Only has `key` ability: non-transferable, locked to original purchaser
    /// - Prevents secondary market trading
    /// - Ensures one subscription = one user
    public struct SubscriptionNFT has key {
        id: UID,
        tier: u8,
        owner: address,
        /// Token balance: initialized to 1000, decremented by 5 per analysis
        token_balance: u64,
    }
    
    /// Treasury to collect subscription payments
    /// Security features:
    /// - Shared object: readable by all, modifiable only through authorized functions
    /// - Balance protected: cannot be directly accessed
    /// - Withdrawal requires TreasuryOwnerCap
    public struct Treasury has key {
        id: UID,
        /// Total balance collected from subscriptions
        balance: Balance<SUI>,
        /// Owner who can withdraw funds
        owner: address,
        /// Total subscriptions sold per tier (for analytics)
        basic_sold: u64,
        pro_sold: u64,
        elite_sold: u64,
    }
    
    /// Admin capability for treasury management
    /// Security features:
    /// - Only one exists (created at init)
    /// - Required for withdrawals
    /// - Can be transferred to new owner if needed
    /// - Has `store` for transferability (unlike subscription NFTs)
    public struct TreasuryOwnerCap has key, store {
        id: UID,
        treasury_id: address,
    }
    
    // ===== Events =====
    
    /// Event emitted when a subscription is created
    public struct SubscriptionCreated has copy, drop {
        nft_id: address,
        tier: u8,
        owner: address,
        initial_balance: u64,
        price_paid: u64,
    }
    
    /// Event emitted when tokens are deducted
    public struct TokensDeducted has copy, drop {
        nft_id: address,
        amount: u64,
        remaining_balance: u64,
    }
    
    /// Event emitted when funds are withdrawn from treasury
    public struct TreasuryWithdrawal has copy, drop {
        amount: u64,
        recipient: address,
        remaining_balance: u64,
    }
    
    /// Event emitted when payment is received
    public struct PaymentReceived has copy, drop {
        payer: address,
        amount: u64,
        tier: u8,
        treasury_balance: u64,
    }
    
    /// Event emitted when subscription is upgraded
    public struct SubscriptionUpgraded has copy, drop {
        old_nft_id: address,
        new_nft_id: address,
        old_tier: u8,
        new_tier: u8,
        tokens_preserved: u64,
        tokens_added: u64,
        total_tokens: u64,
        price_paid: u64,
        owner: address,
    }
    
    // ===== Initialization =====
    
    /// Called once when package is published
    /// Creates treasury and admin capability
    /// 
    /// Security guarantees:
    /// - Only called once during publish
    /// - Treasury is shared (public read, controlled write)
    /// - Owner capability given to deployer
    fun init(ctx: &mut TxContext) {
        create_treasury(ctx);
    }
    
    /// Helper function for init (separated for testing)
    fun create_treasury(ctx: &mut TxContext) {
        let treasury_uid = object::new(ctx);
        let treasury_id = object::uid_to_address(&treasury_uid);
        
        let treasury = Treasury {
            id: treasury_uid,
            balance: balance::zero(),
            owner: tx_context::sender(ctx),
            basic_sold: 0,
            pro_sold: 0,
            elite_sold: 0,
        };
        
        let owner_cap = TreasuryOwnerCap {
            id: object::new(ctx),
            treasury_id,
        };
        
        // Share treasury - anyone can read, only authorized functions can modify
        transfer::share_object(treasury);
        
        // Give ownership capability to deployer
        transfer::transfer(owner_cap, tx_context::sender(ctx));
    }
    
    #[test_only]
    /// Test-only function to initialize the module
    public fun init_for_testing(ctx: &mut TxContext) {
        create_treasury(ctx);
    }
    
    // ===== Public Entry Functions =====
    
    /// Subscribe to Basic tier
    /// 
    /// Security guarantees:
    /// - Payment verified before subscription creation
    /// - Exact payment required (no overpayment kept)
    /// - Change returned automatically
    /// - Reentrancy safe: payment processed atomically
    /// - NFT created only after successful payment
    /// 
    /// @param payment: Coin<SUI> with at least PRICE_BASIC amount
    /// @param treasury: Mutable reference to shared Treasury
    /// @param ctx: Transaction context
    public entry fun subscribe_basic(
        payment: Coin<SUI>,
        treasury: &mut Treasury,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Verify payment amount
        let paid = coin::value(&payment);
        assert!(paid >= PRICE_BASIC, EInsufficientPayment);
        
        // Process payment atomically (reentrancy safe)
        let mut payment_balance = coin::into_balance(payment);
        let subscription_fee = balance::split(&mut payment_balance, PRICE_BASIC);
        
        // Add to treasury
        balance::join(&mut treasury.balance, subscription_fee);
        treasury.basic_sold = treasury.basic_sold + 1;
        
        // Emit payment event
        event::emit(PaymentReceived {
            payer: sender,
            amount: PRICE_BASIC,
            tier: TIER_BASIC,
            treasury_balance: balance::value(&treasury.balance),
        });
        
        // Return change if overpaid
        if (balance::value(&payment_balance) > 0) {
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        } else {
            balance::destroy_zero(payment_balance);
        };
        
        // Create subscription NFT AFTER payment is secured
        let nft = SubscriptionNFT {
            id: object::new(ctx),
            tier: TIER_BASIC,
            owner: sender,
            token_balance: DEFAULT_TOKEN_BALANCE,
        };
        
        let nft_id = object::uid_to_address(&nft.id);
        
        event::emit(SubscriptionCreated {
            nft_id,
            tier: TIER_BASIC,
            owner: sender,
            initial_balance: DEFAULT_TOKEN_BALANCE,
            price_paid: PRICE_BASIC,
        });
        
        // Transfer NFT (non-transferable due to lack of `store` ability)
        transfer::transfer(nft, sender);
    }
    
    /// Subscribe to Pro tier
    public entry fun subscribe_pro(
        payment: Coin<SUI>,
        treasury: &mut Treasury,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        let paid = coin::value(&payment);
        assert!(paid >= PRICE_PRO, EInsufficientPayment);
        
        let mut payment_balance = coin::into_balance(payment);
        let subscription_fee = balance::split(&mut payment_balance, PRICE_PRO);
        
        balance::join(&mut treasury.balance, subscription_fee);
        treasury.pro_sold = treasury.pro_sold + 1;
        
        event::emit(PaymentReceived {
            payer: sender,
            amount: PRICE_PRO,
            tier: TIER_PRO,
            treasury_balance: balance::value(&treasury.balance),
        });
        
        if (balance::value(&payment_balance) > 0) {
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        } else {
            balance::destroy_zero(payment_balance);
        };
        
        let nft = SubscriptionNFT {
            id: object::new(ctx),
            tier: TIER_PRO,
            owner: sender,
            token_balance: DEFAULT_TOKEN_BALANCE,
        };
        
        let nft_id = object::uid_to_address(&nft.id);
        
        event::emit(SubscriptionCreated {
            nft_id,
            tier: TIER_PRO,
            owner: sender,
            initial_balance: DEFAULT_TOKEN_BALANCE,
            price_paid: PRICE_PRO,
        });
        
        transfer::transfer(nft, sender);
    }
    
    /// Subscribe to Elite tier
    public entry fun subscribe_elite(
        payment: Coin<SUI>,
        treasury: &mut Treasury,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        let paid = coin::value(&payment);
        assert!(paid >= PRICE_ELITE, EInsufficientPayment);
        
        let mut payment_balance = coin::into_balance(payment);
        let subscription_fee = balance::split(&mut payment_balance, PRICE_ELITE);
        
        balance::join(&mut treasury.balance, subscription_fee);
        treasury.elite_sold = treasury.elite_sold + 1;
        
        event::emit(PaymentReceived {
            payer: sender,
            amount: PRICE_ELITE,
            tier: TIER_ELITE,
            treasury_balance: balance::value(&treasury.balance),
        });
        
        if (balance::value(&payment_balance) > 0) {
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        } else {
            balance::destroy_zero(payment_balance);
        };
        
        let nft = SubscriptionNFT {
            id: object::new(ctx),
            tier: TIER_ELITE,
            owner: sender,
            token_balance: DEFAULT_TOKEN_BALANCE,
        };
        
        let nft_id = object::uid_to_address(&nft.id);
        
        event::emit(SubscriptionCreated {
            nft_id,
            tier: TIER_ELITE,
            owner: sender,
            initial_balance: DEFAULT_TOKEN_BALANCE,
            price_paid: PRICE_ELITE,
        });
        
        transfer::transfer(nft, sender);
    }
    
    /// Upgrade existing subscription to a higher tier
    /// 
    /// Security guarantees:
    /// - Verifies ownership of old NFT
    /// - Cannot downgrade (only upgrade)
    /// - Cannot "upgrade" to same tier
    /// - Payment verified for price difference
    /// - Old NFT destroyed atomically
    /// - Tokens preserved + bonus added
    /// - Change returned if overpaid
    /// 
    /// Economics:
    /// - User pays only the DIFFERENCE in price
    /// - Old tokens preserved (fair)
    /// - Bonus tokens added (reward for upgrading)
    /// - Example: Basic (0.1) → Pro (0.5) = pay 0.4 SUI
    /// 
    /// @param old_nft: The subscription to upgrade (will be destroyed)
    /// @param new_tier: Target tier (must be higher than current)
    /// @param payment: Coin<SUI> with at least price difference
    /// @param treasury: Mutable reference to shared Treasury
    /// @param ctx: Transaction context
    public entry fun upgrade_subscription(
        old_nft: SubscriptionNFT,
        new_tier: u8,
        payment: Coin<SUI>,
        treasury: &mut Treasury,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Security: Verify ownership
        assert!(old_nft.owner == sender, EUnauthorized);
        
        // Validation: Check tier is valid
        assert!(new_tier == TIER_BASIC || new_tier == TIER_PRO || new_tier == TIER_ELITE, EInvalidTier);
        
        // Validation: Cannot "upgrade" to same tier (check first before downgrade check)
        assert!(new_tier != old_nft.tier, ESameTier);
        
        // Validation: Cannot downgrade
        assert!(new_tier > old_nft.tier, ECannotDowngrade);
        
        // Calculate price difference
        let old_price = get_tier_price(old_nft.tier);
        let new_price = get_tier_price(new_tier);
        let price_diff = new_price - old_price;
        
        // Verify payment
        let paid = coin::value(&payment);
        assert!(paid >= price_diff, EInsufficientPayment);
        
        // Process payment atomically
        let mut payment_balance = coin::into_balance(payment);
        let upgrade_fee = balance::split(&mut payment_balance, price_diff);
        
        // Add to treasury
        balance::join(&mut treasury.balance, upgrade_fee);
        
        // Update sales counter for new tier
        if (new_tier == TIER_BASIC) {
            treasury.basic_sold = treasury.basic_sold + 1;
        } else if (new_tier == TIER_PRO) {
            treasury.pro_sold = treasury.pro_sold + 1;
        } else if (new_tier == TIER_ELITE) {
            treasury.elite_sold = treasury.elite_sold + 1;
        };
        
        // Emit payment event
        event::emit(PaymentReceived {
            payer: sender,
            amount: price_diff,
            tier: new_tier,
            treasury_balance: balance::value(&treasury.balance),
        });
        
        // Return change if overpaid
        if (balance::value(&payment_balance) > 0) {
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        } else {
            balance::destroy_zero(payment_balance);
        };
        
        // Preserve tokens from old NFT
        let old_tokens = old_nft.token_balance;
        let old_tier_val = old_nft.tier;
        
        // Get old NFT ID before destroying
        let old_nft_id = object::uid_to_address(&old_nft.id);
        
        // Destroy old NFT (move semantic - consumes the object)
        let SubscriptionNFT { id, tier: _, owner: _, token_balance: _ } = old_nft;
        object::delete(id);
        
        // Create new NFT with preserved tokens + bonus
        let total_tokens = old_tokens + DEFAULT_TOKEN_BALANCE;
        let nft = SubscriptionNFT {
            id: object::new(ctx),
            tier: new_tier,
            owner: sender,
            token_balance: total_tokens,
        };
        
        let new_nft_id = object::uid_to_address(&nft.id);
        
        // Emit upgrade event
        event::emit(SubscriptionUpgraded {
            old_nft_id,
            new_nft_id,
            old_tier: old_tier_val,
            new_tier,
            tokens_preserved: old_tokens,
            tokens_added: DEFAULT_TOKEN_BALANCE,
            total_tokens,
            price_paid: price_diff,
            owner: sender,
        });
        
        // Transfer new NFT (non-transferable due to lack of `store` ability)
        transfer::transfer(nft, sender);
    }
    
    // ===== Treasury Management Functions =====
    
    /// Withdraw funds from treasury
    /// 
    /// Security guarantees:
    /// - Requires TreasuryOwnerCap (only owner has this)
    /// - Verifies cap matches treasury
    /// - Cannot withdraw more than balance
    /// - Emits event for transparency
    /// - Reentrancy safe: no callbacks
    /// 
    /// @param owner_cap: Proof of ownership
    /// @param treasury: Mutable reference to treasury
    /// @param amount: Amount to withdraw in MIST
    /// @param recipient: Address to send funds to
    /// @param ctx: Transaction context
    public entry fun withdraw(
        owner_cap: &TreasuryOwnerCap,
        treasury: &mut Treasury,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        // Security check: Verify cap matches this treasury
        assert!(owner_cap.treasury_id == object::uid_to_address(&treasury.id), EUnauthorized);
        
        // Security check: Cannot withdraw more than balance
        assert!(amount <= balance::value(&treasury.balance), EInvalidAmount);
        
        // Withdraw funds atomically (reentrancy safe)
        let withdrawn = balance::split(&mut treasury.balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        
        // Emit event for transparency
        event::emit(TreasuryWithdrawal {
            amount,
            recipient,
            remaining_balance: balance::value(&treasury.balance),
        });
        
        // Transfer funds
        transfer::public_transfer(coin, recipient);
    }
    
    /// Transfer treasury ownership to new owner
    /// 
    /// Security guarantees:
    /// - Requires current owner capability
    /// - Updates treasury owner record
    /// - Transfers capability to new owner
    /// - Cannot be reversed except by new owner
    /// 
    /// @param owner_cap: Current owner's capability
    /// @param treasury: Mutable reference to treasury
    /// @param new_owner: Address of new owner
    public entry fun transfer_ownership(
        owner_cap: TreasuryOwnerCap,
        treasury: &mut Treasury,
        new_owner: address,
    ) {
        // Verify cap matches treasury
        assert!(owner_cap.treasury_id == object::uid_to_address(&treasury.id), EUnauthorized);
        
        // Update treasury owner
        treasury.owner = new_owner;
        
        // Transfer capability to new owner
        transfer::transfer(owner_cap, new_owner);
    }
    
    // ===== Public Getter Functions =====
    
    /// Get the tier from subscription NFT
    public fun get_tier(nft: &SubscriptionNFT): u8 {
        nft.tier
    }
    
    /// Get the owner from subscription NFT
    public fun get_owner(nft: &SubscriptionNFT): address {
        nft.owner
    }
    
    /// Get the token balance from subscription NFT
    public fun get_token_balance(nft: &SubscriptionNFT): u64 {
        nft.token_balance
    }
    
    /// Get the NFT ID (address) from subscription NFT
    public fun get_nft_id(nft: &SubscriptionNFT): address {
        object::uid_to_address(&nft.id)
    }
    
    /// Check if tier matches
    public fun is_tier(nft: &SubscriptionNFT, tier: u8): bool {
        nft.tier == tier
    }
    
    /// Get treasury balance (read-only, anyone can call)
    public fun get_treasury_balance(treasury: &Treasury): u64 {
        balance::value(&treasury.balance)
    }
    
    /// Get treasury owner
    public fun get_treasury_owner(treasury: &Treasury): address {
        treasury.owner
    }
    
    /// Get subscription sales stats
    public fun get_sales_stats(treasury: &Treasury): (u64, u64, u64) {
        (treasury.basic_sold, treasury.pro_sold, treasury.elite_sold)
    }
    
    /// Get price for a tier
    public fun get_tier_price(tier: u8): u64 {
        if (tier == TIER_BASIC) {
            PRICE_BASIC
        } else if (tier == TIER_PRO) {
            PRICE_PRO
        } else if (tier == TIER_ELITE) {
            PRICE_ELITE
        } else {
            0
        }
    }
    
    // ===== Package-Only Functions =====
    
    /// Deduct tokens from a subscription
    /// 
    /// Security guarantees:
    /// - `public(package)` visibility: only this package can call
    /// - Balance checked before deduction
    /// - Cannot go negative
    /// - Event emitted for transparency
    /// 
    /// @param nft: Mutable reference to the subscription NFT
    /// @param amount: Number of tokens to deduct
    public(package) fun deduct_tokens(nft: &mut SubscriptionNFT, amount: u64) {
        assert!(nft.token_balance >= amount, EInsufficientTokens);
        
        nft.token_balance = nft.token_balance - amount;
        
        let nft_id = object::uid_to_address(&nft.id);
        event::emit(TokensDeducted {
            nft_id,
            amount,
            remaining_balance: nft.token_balance,
        });
    }
    
    /// Check if subscription has enough tokens
    public(package) fun has_sufficient_tokens(nft: &SubscriptionNFT, required_amount: u64): bool {
        nft.token_balance >= required_amount
    }
}
