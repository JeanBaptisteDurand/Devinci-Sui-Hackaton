module sui_subscription_analyzer::analyzer {
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui_subscription_analyzer::subscription::{Self, SubscriptionNFT};

    // ===== Constants =====
    
    /// Cost per analysis in tokens
    const TOKENS_PER_ANALYSIS: u64 = 5;
    
    // ===== Error Codes =====
    
    const EInvalidSubscription: u64 = 1;
    const ETierMismatch: u64 = 2;
    const EInsufficientTokens: u64 = 3;
    const EInvalidDepth: u64 = 4;
    
    // ===== Events =====
    
    /// Event emitted when text is analyzed
    public struct PackageAnalyzed has copy, drop {
        user: address,
        tier_id: u8,
        package_id: vector<u8>,        // Package ID to analyze (as bytes)
        depth: u8,                      // Depth of analysis (1-3)
        subscription_nft_id: address,   // Subscription NFT ID
        tokens_remaining: u64,
    }
    
    // ===== Public Entry Functions =====
    
    /// Analyze text and emit event (with tier verification)
    /// 
    /// This function:
    /// 1. Verifies the subscription belongs to the caller
    /// 2. Verifies the tier matches the requested tier
    /// 3. Checks if subscription has enough tokens (minimum 5)
    /// 4. Deducts 5 tokens from the subscription
    /// 5. Emits analysis event with remaining token balance
    /// 
    /// Security guarantees:
    /// - Only the subscription owner can use their subscription
    /// - Tokens are automatically deducted (user cannot bypass this)
    /// - Transaction fails if insufficient tokens (prevents analysis without payment)
    /// - Token deduction happens BEFORE event emission (no way to emit event without paying)
    /// 
    /// @param subscription: Mutable reference to subscription NFT (tokens will be deducted)
    /// @param tier_id: Expected tier (must match subscription tier)
    /// @param text: Text to analyze
    /// @param ctx: Transaction context
    /// 
    /// Aborts if:
    /// - Subscription doesn't belong to caller (EInvalidSubscription)
    /// - Tier doesn't match (ETierMismatch)
    /// - Insufficient tokens (EInsufficientTokens)
    public entry fun analyze_and_emit_event(
        subscription: &mut SubscriptionNFT,
        tier_id: u8,
        text: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Security check 1: Verify the subscription belongs to the sender
        // This prevents users from using someone else's subscription
        assert!(subscription::get_owner(subscription) == sender, EInvalidSubscription);
        
        // Security check 2: Verify the subscription tier matches the requested tier
        assert!(subscription::is_tier(subscription, tier_id), ETierMismatch);
        
        // Security check 3: Verify sufficient token balance
        // This check happens BEFORE deduction to provide clear error message
        assert!(
            subscription::has_sufficient_tokens(subscription, TOKENS_PER_ANALYSIS),
            EInsufficientTokens
        );
        
        // Deduct tokens for this analysis
        // This is done BEFORE emitting the event to ensure payment happens first
        // Only this package can call deduct_tokens (public(package) visibility)
        subscription::deduct_tokens(subscription, TOKENS_PER_ANALYSIS);
        
        // Get remaining balance to include in event
        let remaining_balance = subscription::get_token_balance(subscription);
        
        // Get subscription NFT ID
        let subscription_nft_id = subscription::get_nft_id(subscription);
        
        // Emit the analysis event with remaining token balance
        // Note: analyze_and_emit_event doesn't have depth parameter, so we use 1 as default
        event::emit(PackageAnalyzed {
            user: sender,
            tier_id,
            package_id: text,
            depth: 1,  // Default depth for this function
            subscription_nft_id,
            tokens_remaining: remaining_balance,
        });
    }
    
    /// Analyze text (simplified version - auto-detects tier)
    /// 
    /// This is the recommended function to use. It automatically uses the tier
    /// from the subscription NFT, so there's no need to pass tier_id separately.
    /// 
    /// Process:
    /// 1. Verifies subscription ownership
    /// 2. Validates depth (must be 1-3)
    /// 3. Extracts tier from subscription
    /// 4. Checks token balance (requires at least 5 tokens)
    /// 5. Deducts 5 tokens
    /// 6. Emits analysis event with all required data
    /// 
    /// @param subscription: Mutable reference to subscription NFT
    /// @param package_id: Package ID to analyze (as bytes)
    /// @param depth: Depth of analysis (must be 1, 2, or 3)
    /// @param ctx: Transaction context
    /// 
    /// Aborts if:
    /// - Subscription doesn't belong to caller (EInvalidSubscription)
    /// - Depth is not 1, 2, or 3 (EInvalidDepth)
    /// - Insufficient tokens (EInsufficientTokens)
    public entry fun analyze_Package(
        subscription: &mut SubscriptionNFT,
        package_id: vector<u8>,
        depth: u8,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Security check: Verify the subscription belongs to the sender
        assert!(subscription::get_owner(subscription) == sender, EInvalidSubscription);
        
        // Validate depth: must be 1, 2, or 3
        assert!(depth >= 1 && depth <= 3, EInvalidDepth);
        
        // Check token balance before attempting to deduct
        assert!(
            subscription::has_sufficient_tokens(subscription, TOKENS_PER_ANALYSIS),
            EInsufficientTokens
        );
        
        // Extract tier from subscription
        let tier = subscription::get_tier(subscription);
        
        // Get subscription NFT ID before deducting tokens
        let subscription_nft_id = subscription::get_nft_id(subscription);
        
        // Deduct tokens BEFORE emitting event
        // This ensures the user pays before the analysis is logged
        subscription::deduct_tokens(subscription, TOKENS_PER_ANALYSIS);
        
        // Get remaining balance after deduction
        let remaining_balance = subscription::get_token_balance(subscription);
        
        // Emit the analysis event with all required data
        event::emit(PackageAnalyzed {
            user: sender,
            tier_id: tier,
            package_id,
            depth,
            subscription_nft_id,
            tokens_remaining: remaining_balance,
        });
    }
    
    // ===== View Functions =====
    
    /// Check if a subscription can afford an analysis
    /// 
    /// This is a view function that doesn't modify state.
    /// Useful for frontend to check before submitting transaction.
    /// 
    /// @param subscription: Reference to subscription NFT
    /// @return true if subscription has at least 5 tokens
    public fun can_analyze(subscription: &SubscriptionNFT): bool {
        subscription::has_sufficient_tokens(subscription, TOKENS_PER_ANALYSIS)
    }
    
    /// Get the cost of one analysis
    /// 
    /// @return Number of tokens required per analysis (5)
    public fun get_analysis_cost(): u64 {
        TOKENS_PER_ANALYSIS
    }
}
