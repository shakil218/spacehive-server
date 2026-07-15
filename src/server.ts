import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { getStripe } from "./lib/stripe.js";
import { stripeWebhookHandler } from "./controllers/stripeWebhook.js";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());

app.get("/", (_req, res) => {
  res.send("🚀 SpaceHive Server Running...");
});

const uri = process.env.MONGO_URI!;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const database = client.db(process.env.DB_NAME);

    const usersCollection = database.collection("user");
    const spacesCollection = database.collection("spaces");
    const bookingsCollection = database.collection("bookings");

    // Stripe Webhook (must use raw body)
    app.post(
      "/api/stripe/webhook",
      express.raw({ type: "application/json" }),
      stripeWebhookHandler({
        bookingsCollection,
      }),
    );

    // Parse JSON for all remaining routes
    app.use(express.json());

    // ===========================
    // Users API
    // ===========================

    // Get All Users
    app.get("/api/users", async (_req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        const formattedUsers = users.map((user) => ({
          ...user,
          role: user.role ?? "user",
          status: user.status ?? "active",
        }));

        return res.status(200).send({
          success: true,
          message: "Users fetched successfully",
          users: formattedUsers,
        });
      } catch (error) {
        console.error("Get Users Error:", error);

        return res.status(500).send({
          success: false,
          message: "Failed to fetch users",
        });
      }
    });

    // Update User Role
    app.patch("/api/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!["user", "admin"].includes(role)) {
          return res.status(400).send({
            success: false,
            message: "Invalid role",
          });
        }

        const result = await usersCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              role,
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message: "User role updated successfully",
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to update user role",
        });
      }
    });

    // Update User Status
    app.patch("/api/users/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "blocked"].includes(status)) {
          return res.status(400).send({
            success: false,
            message: "Invalid status",
          });
        }

        const result = await usersCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status,
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message: "User status updated successfully",
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to update user status",
        });
      }
    });

    // ===========================
    // Spaces API
    // ===========================

    // Get All Spaces
    app.get("/api/spaces", async (req, res) => {
      try {
        const {
          search = "",
          category,
          location,
          rating,
          sort = "newest",
          page = "1",
          limit = "8",
        } = req.query;

        // -----------------------------
        // Query
        // -----------------------------
        const query: any = {};

        // Search
        if (search) {
          query.title = {
            $regex: search.toString(),
            $options: "i",
          };
        }

        // Category
        if (category && category !== "All") {
          query.category = category;
        }

        // Rating
        if (rating) {
          query.rating = {
            $gte: Number(rating),
          };
        }

        // -----------------------------
        // Sorting
        // -----------------------------
        let sortQuery: Record<string, 1 | -1>;

        switch (sort) {
          case "rating":
            sortQuery = { rating: -1 };
            break;

          case "price-low":
            sortQuery = { price: 1 };
            break;

          case "price-high":
            sortQuery = { price: -1 };
            break;

          default:
            sortQuery = { _id: -1 };
        }

        // -----------------------------
        // Pagination
        // -----------------------------
        const currentPage = Number(page);
        const pageSize = Number(limit);

        const skip = (currentPage - 1) * pageSize;

        const totalSpaces = await spacesCollection.countDocuments(query);

        const spaces = await spacesCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(pageSize)
          .toArray();

        res.status(200).send({
          success: true,
          spaces,
          totalSpaces,
          currentPage,
          totalPages: Math.ceil(totalSpaces / pageSize),
          limit: pageSize,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch spaces",
        });
      }
    });

    // Get Featured Spaces
    app.get("/api/spaces/featured", async (_req, res) => {
      const spaces = await spacesCollection
        .find()
        .sort({ rating: -1 })
        .limit(8)
        .toArray();

      res.send(spaces);
    });

    // Get Single Space
    app.get("/api/spaces/:id", async (req, res) => {
      const { id } = req.params;

      const space = await spacesCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(space);
    });

    // Get Related Spaces
    app.get("/api/spaces/related/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const currentSpace = await spacesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!currentSpace) {
          return res.status(404).send({
            message: "Space not found",
          });
        }

        const relatedSpaces = await spacesCollection
          .find({
            _id: {
              $ne: new ObjectId(id),
            },
            category: currentSpace.category,
          })
          .limit(4)
          .toArray();

        res.send(relatedSpaces);
      } catch (error) {
        console.error(error);

        res.status(500).send({
          message: "Failed to fetch related spaces",
        });
      }
    });

    // Create Space
    app.post("/api/spaces", async (req, res) => {
      try {
        const newSpace = {
          ...req.body,

          rating: 0,
          totalReviews: 0,
          totalBookings: 0,

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await spacesCollection.insertOne(newSpace);

        res.status(201).send({
          success: true,
          message: "Space created successfully",
          insertedId: result.insertedId,
          data: newSpace,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to create space",
        });
      }
    });

    // ===========================
    // Spaces Stats API
    // ===========================
    app.get("/api/stats", async (_req, res) => {
      try {
        const [totalSpaces, totalCategories, totalLocations, avgResult] =
          await Promise.all([
            spacesCollection.countDocuments(),

            spacesCollection
              .aggregate([{ $group: { _id: "$category" } }])
              .toArray(),

            spacesCollection
              .aggregate([{ $group: { _id: "$location" } }])
              .toArray(),

            spacesCollection
              .aggregate([
                {
                  $group: {
                    _id: null,
                    avgRating: { $avg: "$rating" },
                  },
                },
              ])
              .toArray(),
          ]);

        res.send({
          totalSpaces,
          totalCategories: totalCategories.length,
          totalLocations: totalLocations.length,
          avgRating: avgResult[0]?.avgRating?.toFixed(1) ?? "0.0",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch stats" });
      }
    });

    // ===========================
    // Bookings API
    // ===========================

    // Get User Bookings
    app.get("/api/bookings/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId) {
          return res.status(400).send({
            success: false,
            message: "User ID is required",
          });
        }

        const bookings = await bookingsCollection
          .find({
            userId,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send({
          success: true,
          bookings,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch user bookings",
        });
      }
    });

    // Get Single Booking
    app.get("/api/bookings/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!booking) {
          return res.status(404).send({
            success: false,
            message: "Booking not found",
          });
        }

        res.send({
          success: true,
          booking,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch booking",
        });
      }
    });

    // User Booking Statistics
    app.get("/api/user/bookings/statistics/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const bookings = await bookingsCollection
          .find({
            userId,
          })
          .toArray();

        // =============================
        // Summary Statistics
        // =============================

        const totalBookings = bookings.length;

        const confirmedBookings = bookings.filter(
          (booking) => booking.bookingStatus === "confirmed",
        ).length;

        const cancelledBookings = bookings.filter(
          (booking) => booking.bookingStatus === "cancelled",
        ).length;

        const totalSpent = bookings
          .filter((booking) => booking.paymentStatus === "paid")
          .reduce(
            (total, booking) => total + Number(booking.totalPrice || 0),
            0,
          );

        // =============================
        // Monthly Chart Data
        // =============================

        type MonthlyStatistics = {
          month: string;
          bookings: number;
          cancelledBookings: number;
          spending: number;
        };

        const monthlyStatistics: Record<string, MonthlyStatistics> = {};

        bookings.forEach((booking) => {
          const date = new Date(booking.bookingDate);

          const month = date.toLocaleString("default", {
            month: "short",
          });

          if (!monthlyStatistics[month]) {
            monthlyStatistics[month] = {
              month,
              bookings: 0,
              cancelledBookings: 0,
              spending: 0,
            };
          }

          // Total bookings
          monthlyStatistics[month].bookings += 1;

          // Cancelled bookings
          if (booking.bookingStatus === "cancelled") {
            monthlyStatistics[month].cancelledBookings += 1;
          }

          // Total spending
          if (booking.paymentStatus === "paid") {
            monthlyStatistics[month].spending += Number(
              booking.totalPrice || 0,
            );
          }
        });

        // =============================
        // Sort Months
        // =============================

        const monthOrder = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        const chartData = Object.values(monthlyStatistics).sort(
          (a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month),
        );

        // =============================
        // Response
        // =============================

        res.send({
          success: true,

          summary: {
            totalBookings,
            confirmedBookings,
            cancelledBookings,
            totalSpent,
          },

          chartData,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to load booking statistics",
        });
      }
    });

    // Create Booking
    app.post("/api/bookings", async (req, res) => {
      try {
        const booking = {
          ...req.body,

          paymentStatus: "pending",
          bookingStatus: "pending",

          stripeSessionId: null,
          stripePaymentIntentId: null,

          createdAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(booking);

        res.status(201).send({
          success: true,
          insertedId: result.insertedId,
          booking,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to create booking",
        });
      }
    });

    // Cancel Booking
    app.patch("/api/bookings/:id/cancel", async (req, res) => {
      try {
        const { id } = req.params;

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!booking) {
          return res.status(404).send({
            success: false,
            message: "Booking not found",
          });
        }

        if (booking.paymentStatus === "paid") {
          return res.status(400).send({
            success: false,
            message: "Paid bookings cannot be cancelled.",
          });
        }

        if (booking.bookingStatus === "cancelled") {
          return res.status(400).send({
            success: false,
            message: "Booking is already cancelled.",
          });
        }

        await bookingsCollection.updateOne(
          {
            _id: booking._id,
          },
          {
            $set: {
              bookingStatus: "cancelled",
              cancelledAt: new Date(),
            },
          },
        );

        res.send({
          success: true,
          message: "Booking cancelled successfully.",
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to cancel booking.",
        });
      }
    });

    // Delete Booking
    app.delete("/api/bookings/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!booking) {
          return res.status(404).send({
            success: false,
            message: "Booking not found",
          });
        }

        if (booking.bookingStatus !== "cancelled") {
          return res.status(400).send({
            success: false,
            message: "Only cancelled bookings can be deleted",
          });
        }

        await bookingsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          message: "Booking deleted successfully",
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to delete booking",
        });
      }
    });

    // ===========================
    // Payment API
    // ===========================

    // Create Checkout Session
    app.post("/api/create-checkout-session", async (req, res) => {
      try {
        const stripe = getStripe();

        const { bookingId } = req.body;

        if (!bookingId) {
          return res.status(400).send({
            success: false,
            message: "Booking ID is required",
          });
        }

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(bookingId),
        });

        if (!booking) {
          return res.status(404).send({
            success: false,
            message: "Booking not found",
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: "payment",

          payment_method_types: ["card"],

          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: booking.totalPrice * 100,
                product_data: {
                  name: booking.title,
                  images: [booking.imageUrl],
                },
              },
            },
          ],

          metadata: {
            bookingId: booking._id.toString(),
            userId: booking.userId,
            spaceId: booking.spaceId,
          },

          success_url: `${process.env.CLIENT_URL}/booking/success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url: `${process.env.CLIENT_URL}/booking/cancel`,
        });

        await bookingsCollection.updateOne(
          { _id: booking._id },
          {
            $set: {
              stripeSessionId: session.id,
            },
          },
        );

        res.send({
          success: true,
          url: session.url,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Failed to create checkout session",
        });
      }
    });

    await client.db("admin").command({
      ping: 1,
    });

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
