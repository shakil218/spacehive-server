import { ObjectId } from "mongodb";
import { getStripe } from "../lib/stripe.js";
export const stripeWebhookHandler = (context) => {
    return async (req, res) => {
        const stripe = getStripe();
        const sig = req.headers["stripe-signature"];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        let event;
        try {
            // req.body must be the raw Buffer provided by express.raw()
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        }
        catch (err) {
            console.error("❌ Webhook Signature Verification Failed:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
        // Handle the event
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            const bookingId = session.metadata?.bookingId;
            if (bookingId) {
                await context.bookingsCollection.updateOne({ _id: new ObjectId(`${bookingId}`) }, {
                    $set: {
                        paymentStatus: "paid",
                        bookingStatus: "confirmed",
                        stripePaymentIntentId: session.payment_intent,
                        paidAt: new Date(),
                    },
                });
                console.log(`✅ Booking ${bookingId} successfully confirmed via Stripe!`);
            }
        }
        res.json({ received: true });
    };
};
