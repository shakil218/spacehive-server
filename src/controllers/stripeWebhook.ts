import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { getStripe } from "../lib/stripe.js";


interface StripeWebhookDependencies {
  bookingsCollection: any;
}

export const stripeWebhookHandler =
({ bookingsCollection }: StripeWebhookDependencies) =>
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;
    const stripe = getStripe();

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);

      return res.status(400).send("Invalid signature");
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;

          const bookingId = session.metadata?.bookingId;

          if (!bookingId) break;

          await bookingsCollection.updateOne(
            {
              _id: new ObjectId(bookingId),
            },
            {
              $set: {
                paymentStatus: "paid",
                bookingStatus: "confirmed",
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                paidAt: new Date(),
              },
            }
          );

          console.log("✅ Booking confirmed:", bookingId);

          break;
        }

        default:
          console.log(`Unhandled event: ${event.type}`);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error(error);

      res.sendStatus(500);
    }
  };