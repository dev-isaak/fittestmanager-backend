// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts";
import Stripe from "npm:stripe@^11.16";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
let customerEmail = "";
let supabase: any;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const stripe = Stripe(Deno.env.get("STRIPE_API_KEY"), {
  // This is needed to use the Fetch API rather than relying on the Node http
  // package.
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (request) => {
  const signature = request.headers.get("Stripe-Signature");

  // First step is to verify the event. The .text() method must be used as the
  // verification relies on the raw request body rather than the parsed JSON.
  const body = await request.text();
  let receivedEvent;
  try {
    receivedEvent = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET"),
      undefined,
    );
  } catch (err) {
    return new Response(err.message, { status: 400 });
  }

  console.log(receivedEvent);

  if (receivedEvent.type === "customer.created") {
    // customerEmail = receivedEvent.data.object.email;
    console.log("email: ", customerEmail);

    const { data, error } = await supabase
      .from("customers")
      .update({ stripe_customer_id: receivedEvent.data.object.id })
      .eq("email", receivedEvent.data.object.email);

    if (error) throw error;
  }

  if (receivedEvent.type === "customer.subscription.created") {
    // console.log("Subscripción creada");
    console.log("customer: ", receivedEvent.data.object.customer);

    const { data: customerData, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("stripe_customer_id", receivedEvent.data.object.customer)
      .single();

    if (customerError) {
      console.log(customerError);
      throw new Error();
    }

    console.log(customerData);

    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: customerData.uuid,
        status: receivedEvent.status,
        price_id: receivedEvent.data.object.plan.id,
        quantity: 1,
        // cancel_at_period_end: receivedEvent.data.object.cancel_at_period_end,
        // current_period_start: receivedEvent.data.object.current_period_start,
        // current_period_end: receivedEvent.data.object.current_period_end,
        // ended_at: receivedEvent.data.object.ended_at,
        // cancel_at: receivedEvent.data.object.cancel_at,
        // canceled_at: receivedEvent.data.object.canceled_at,
        trial_start: receivedEvent.data.object.trial_start,
        trial_end: receivedEvent.data.object.trial_end,
      });
    if (error) throw error;
    console.log(data);
  }

  return new Response(JSON.stringify({ message: "nice!" }), { status: 200 });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/stripe-webhook' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

/**
 * BACKUP:
 begin
  insert into public.users (id, full_name, avatar_url )
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;

 */
