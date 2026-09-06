/**
 * POST /api/payments/create-checkout
 * 
 * Creates a PayMongo Checkout Session for Florin purchase.
 * 
 * Security:
 * - Requires authenticated student
 * - Validates package from database (not client)
 * - Handles existing pending transactions safely
 * - Uses Idempotency-Key for PayMongo API
 * 
 * Returns:
 * - checkout_url: URL to redirect student to PayMongo
 * - reference_number: Internal transaction reference
 * - status: 'new' | 'reused'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/serviceClient';
import { getServerProfile } from '@/lib/supabase/auth';
import { siteUrlBase } from '@/lib/siteUrl';
import {
  createCheckoutSession,
  generateReferenceNumber,
  pesoToCentavos,
  getCheckoutSessionStatus,
} from '@/lib/paymongo';
import { PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from '@/lib/paymentsConfig';
import type { Database } from '@/types/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface CheckoutRequest {
  package_id: string;
}

interface CheckoutResponse {
  checkout_url: string;
  reference_number: string;
  status: 'new' | 'reused';
  transaction_id: string;
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

interface PendingTransactionRow {
  id: string;
  provider_session_id: string | null;
  reference_number: string;
}

/**
 * Reuse an existing pending transaction's PayMongo session when it is still
 * active. Marks the transaction expired (provider confirmed expiry) or failed
 * (provider unreachable) otherwise, so a fresh session can be created.
 * Returns the reuse response, or null when the caller must create a new one.
 */
async function reuseOrRetirePending(
  supabase: ServiceClient,
  tx: PendingTransactionRow
): Promise<NextResponse | null> {
  if (!tx.provider_session_id) {
    // Legacy/stale row without a session - retire it so the unique pending
    // index lets a new transaction through.
    await (supabase
      .from('payment_transactions') as any)
      .update({
        status: 'failed',
        failure_reason: 'Missing provider session',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);
    return null;
  }

  try {
    const paymongoSession = await getCheckoutSessionStatus(tx.provider_session_id);
    const sessionStatus = paymongoSession.attributes.status;

    if (sessionStatus === 'active' || sessionStatus === 'pending' || sessionStatus === 'payment_processing') {
      // Session still valid - reuse existing checkout URL
      return NextResponse.json({
        checkout_url: paymongoSession.attributes.checkout_url,
        reference_number: tx.reference_number,
        status: 'reused',
        transaction_id: tx.id,
      } satisfies CheckoutResponse);
    }

    if (sessionStatus === 'succeeded' || sessionStatus === 'paid') {
      // The session was PAID but the transaction is still pending - the
      // webhook (or its retry) must complete it. Leave the row untouched so
      // the one-pending invariant holds; never retire a paid session.
      return null;
    }

    // Session expired - mark as expired and create new transaction
    await (supabase
      .from('payment_transactions') as any)
      .update({
        status: 'expired',
        failure_reason: 'PayMongo session expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);
  } catch {
    // Provider lookup failed - mark as failed and create new transaction
    await (supabase
      .from('payment_transactions') as any)
      .update({
        status: 'failed',
        failure_reason: 'Provider session lookup failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tx.id);
  }

  return null;
}

/**
 * Fetch the student's most recent pending transaction, if any.
 */
async function fetchPendingTransaction(
  supabase: ServiceClient,
  studentId: string
): Promise<PendingTransactionRow | null> {
  const { data } = await (supabase
    .from('payment_transactions') as any)
    .select('id, provider_session_id, reference_number')
    .eq('student_id', studentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PendingTransactionRow | null) ?? null;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  // Payments are temporarily disabled - refuse before doing any work
  // (lib/paymentsConfig.ts is the single switch).
  if (!PAYMENTS_ENABLED) {
    return NextResponse.json(
      { error: PAYMENTS_DISABLED_MESSAGE },
      { status: 503 }
    );
  }

  try {
    // 1. Authenticate the request
    const profile = await getServerProfile(request.cookies);
    
    if (!profile.user || !profile.role || !profile.schoolId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // 2. Verify requester is a student
    if (profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Only students can purchase Florin' },
        { status: 403 }
      );
    }
    
    // 3. Parse request body
    const body: CheckoutRequest = await request.json();
    const { package_id } = body;
    
    if (!package_id || typeof package_id !== 'string') {
      return NextResponse.json(
        { error: 'package_id is required' },
        { status: 400 }
      );
    }
    
    // 4. Initialize Supabase service client
    const supabase = createServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 500 }
      );
    }
    
    // 5. Get profile ID from auth user ID
    const { data: profileData, error: profileError } = await (supabase
      .from('profiles') as any)
      .select('id')
      .eq('user_id', profile.user.id)
      .single();
    
    if (profileError || !profileData) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }
    
    const studentId = profileData.id;
    
    // 6. Validate package from database (server-side validation)
    const { data: packageData, error: packageError } = await (supabase
      .from('florin_packages') as any)
      .select('*')
      .eq('id', package_id)
      .eq('active', true)
      .single();
    
    if (packageError || !packageData) {
      return NextResponse.json(
        { error: 'Invalid or inactive package' },
        { status: 400 }
      );
    }
    
    // 7. Check for existing pending transaction (one per student, enforced by
    //    the partial unique index in migration 069)
    const existingTx = await fetchPendingTransaction(supabase, studentId);

    if (existingTx) {
      const reuseResponse = await reuseOrRetirePending(supabase, existingTx);
      if (reuseResponse) {
        return reuseResponse;
      }
    }

    // 8. Create new transaction. A concurrent request may have won the race
    //    for the single pending slot (unique index violation, PG code 23505);
    //    in that case reuse the winner's session instead of erroring.
    const referenceNumber = generateReferenceNumber();

    const { data: newTx, error: txError } = await (supabase
      .from('payment_transactions') as any)
      .insert({
        student_id: studentId,
        school_id: profile.schoolId,
        package_id: packageData.id,
        florin_amount: packageData.florin_amount,
        amount_php: packageData.price_php,
        currency: packageData.currency,
        status: 'pending',
        provider: 'paymongo',
        reference_number: referenceNumber,
      })
      .select()
      .single();

    if (txError || !newTx) {
      if ((txError as { code?: string } | null)?.code === '23505') {
        const winner = await fetchPendingTransaction(supabase, studentId);
        if (winner) {
          const reuseResponse = await reuseOrRetirePending(supabase, winner);
          if (reuseResponse) {
            return reuseResponse;
          }
          // The winning transaction was retired as stale - one clean retry is
          // safe now that the pending slot is free again.
          return NextResponse.json(
            { error: 'Checkout busy, please retry' },
            { status: 409 }
          );
        }
      }
      console.error('Failed to create payment transaction:', txError);
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // 9. Create PayMongo Checkout Session
    const amountCentavos = pesoToCentavos(Number(packageData.price_php));

    // The base URL is deployment configuration ONLY. A client-controlled
    // Origin header must never influence success/cancel URLs (open-redirect /
    // URL-injection vector), so this fails closed when the deployment site
    // URL is unset - same contract as the auth email-redirect links.
    const baseUrl = siteUrlBase();
    if (!baseUrl) {
      console.error('Checkout misconfigured: the deployment site URL is required to build payment redirect URLs.');
      return NextResponse.json(
        { error: 'Checkout is not available right now' },
        { status: 500 }
      );
    }
    
    const paymongoSession = await createCheckoutSession({
      referenceNumber,
      amount: amountCentavos,
      currency: 'PHP',
      description: `${packageData.florin_amount} Florin Pack`,
      paymentMethods: ['gcash'],
      successUrl: `${baseUrl}/payment/success?ref=${referenceNumber}`,
      cancelUrl: `${baseUrl}/payment/cancel?ref=${referenceNumber}`,
      metadata: {
        transaction_id: newTx.id,
        student_id: studentId,
        package_id: packageData.id,
      },
    });
    
    // 10. Update transaction with provider session ID
    await (supabase
      .from('payment_transactions') as any)
      .update({ 
        provider_session_id: paymongoSession.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', newTx.id);
    
    // 11. Return checkout URL to client
    return NextResponse.json({
      checkout_url: paymongoSession.attributes.checkout_url,
      reference_number: referenceNumber,
      status: 'new',
      transaction_id: newTx.id,
    } satisfies CheckoutResponse);
    
  } catch (error) {
    console.error('Checkout creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
