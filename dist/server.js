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
// ==========================================
// 2. Lazy-Loaded MongoDB Connection Utility
// ==========================================
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        deprecationErrors: true,
    },
});
let dbInstance = null;
async function getDatabase() {
    if (!dbInstance) {
        await client.connect();
        dbInstance = client.db(process.env.DB_NAME);
        console.log("🔌 New MongoDB Connection Established");
    }
    return dbInstance;
}
// Middleware to inject collections into the request context lazily
const useDb = async (req, _res, next) => {
    try {
        const db = await getDatabase();
        req.db = db;
        req.usersCollection = db.collection("user");
        req.spacesCollection = db.collection("spaces");
        req.bookingsCollection = db.collection("bookings");
        next();
    }
    catch (error) {
        next(error);
    }
};
// ==========================================
// 3. Route Declarations
// ==========================================
app.get("/", (_req, res) => {
    res.send("🚀 SpaceHive Server Running...");
});
// Stripe Webhook (Must bypass JSON body parsing, gets raw body)
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
        const db = await getDatabase();
        const bookingsCollection = db.collection("bookings");
        // Call the stripe handler with context
        return stripeWebhookHandler({ bookingsCollection })(req, res);
    }
    catch (error) {
        next(error);
    }
});
// Global body parser for all other routes
app.use(express.json());
// ===========================
// Users API
// ===========================
// Get All Users
app.get("/api/users", useDb, async (req, res) => {
    try {
        const users = await req.usersCollection
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
    }
    catch (error) {
        console.error("Get Users Error:", error);
        return res.status(500).send({
            success: false,
            message: "Failed to fetch users",
        });
    }
});
// Update User Role
app.patch("/api/users/:id/role", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!["user", "admin"].includes(role)) {
            return res.status(400).send({
                success: false,
                message: "Invalid role",
            });
        }
        const result = await req.usersCollection.updateOne({ _id: new ObjectId(`${id}`) }, { $set: { role } });
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to update user role",
        });
    }
});
// Update User Status
app.patch("/api/users/:id/status", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["active", "blocked"].includes(status)) {
            return res.status(400).send({
                success: false,
                message: "Invalid status",
            });
        }
        const result = await req.usersCollection.updateOne({ _id: new ObjectId(`${id}`) }, { $set: { status } });
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to update user status",
        });
    }
});
// ===========================
// Admin Dashboard API
// ===========================
app.get("/api/admin/dashboard/stats", useDb, async (req, res) => {
    try {
        const totalUsers = await req.usersCollection.countDocuments();
        const totalSpaces = await req.spacesCollection.countDocuments();
        const totalBookings = await req.bookingsCollection.countDocuments();
        const paidBookings = await req.bookingsCollection
            .find({ paymentStatus: "paid" })
            .toArray();
        const totalRevenue = paidBookings.reduce((total, booking) => total + Number(booking.totalPrice || 0), 0);
        const monthlyStatistics = {};
        paidBookings.forEach((booking) => {
            const date = new Date(booking.bookingDate);
            const month = date.toLocaleString("default", { month: "short" });
            if (!monthlyStatistics[month]) {
                monthlyStatistics[month] = {
                    month,
                    bookings: 0,
                    revenue: 0,
                };
            }
            monthlyStatistics[month].bookings += 1;
            monthlyStatistics[month].revenue += Number(booking.totalPrice || 0);
        });
        const monthOrder = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        const chartData = Object.values(monthlyStatistics).sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
        const recentPayments = await req.bookingsCollection
            .find({ paymentStatus: "paid" })
            .sort({ bookingDate: -1 })
            .limit(5)
            .toArray();
        res.send({
            success: true,
            summary: {
                totalUsers,
                totalSpaces,
                totalBookings,
                totalRevenue,
            },
            chartData,
            recentPayments,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to load admin dashboard",
        });
    }
});
// ===========================
// Spaces API
// ===========================
app.get("/api/spaces", useDb, async (req, res) => {
    try {
        const { search = "", category, rating, sort = "newest", page = "1", limit = "8", } = req.query;
        const query = {};
        if (search) {
            query.title = {
                $regex: search.toString(),
                $options: "i",
            };
        }
        if (category && category !== "All") {
            query.category = category;
        }
        if (rating) {
            query.rating = {
                $gte: Number(rating),
            };
        }
        let sortQuery;
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
        const currentPage = Number(page);
        const pageSize = Number(limit);
        const skip = (currentPage - 1) * pageSize;
        const totalSpaces = await req.spacesCollection.countDocuments(query);
        const spaces = await req.spacesCollection
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to fetch spaces",
        });
    }
});
app.get("/api/spaces/featured", useDb, async (req, res) => {
    try {
        const spaces = await req.spacesCollection
            .find()
            .sort({ rating: -1 })
            .limit(8)
            .toArray();
        res.send(spaces);
    }
    catch (error) {
        res.status(500).send({ message: "Failed to fetch featured spaces" });
    }
});
app.get("/api/spaces/:id", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const space = await req.spacesCollection.findOne({
            _id: new ObjectId(`${id}`),
        });
        res.send(space);
    }
    catch (error) {
        res.status(500).send({ message: "Failed to fetch space" });
    }
});
app.get("/api/spaces/related/:id", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const currentSpace = await req.spacesCollection.findOne({
            _id: new ObjectId(`${id}`),
        });
        if (!currentSpace) {
            return res.status(404).send({
                message: "Space not found",
            });
        }
        const relatedSpaces = await req.spacesCollection
            .find({
            _id: { $ne: new ObjectId(`${id}`) },
            category: currentSpace.category,
        })
            .limit(4)
            .toArray();
        res.send(relatedSpaces);
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            message: "Failed to fetch related spaces",
        });
    }
});
app.post("/api/spaces", useDb, async (req, res) => {
    try {
        const newSpace = {
            ...req.body,
            rating: 0,
            totalReviews: 0,
            totalBookings: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const result = await req.spacesCollection.insertOne(newSpace);
        res.status(201).send({
            success: true,
            message: "Space created successfully",
            insertedId: result.insertedId,
            data: newSpace,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to create space",
        });
    }
});
// ===========================
// Users Stats API
// ===========================
app.get("/api/stats", useDb, async (req, res) => {
    try {
        const [totalSpaces, totalCategories, totalLocations, avgResult] = await Promise.all([
            req.spacesCollection.countDocuments(),
            req.spacesCollection.aggregate([{ $group: { _id: "$category" } }]).toArray(),
            req.spacesCollection.aggregate([{ $group: { _id: "$location" } }]).toArray(),
            req.spacesCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: "$rating" },
                    },
                },
            ]).toArray(),
        ]);
        res.send({
            totalSpaces,
            totalCategories: totalCategories.length,
            totalLocations: totalLocations.length,
            avgRating: avgResult[0]?.avgRating?.toFixed(1) ?? "0.0",
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch stats" });
    }
});
// ===========================
// Bookings API
// ===========================
app.get("/api/bookings/user/:userId", useDb, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).send({
                success: false,
                message: "User ID is required",
            });
        }
        const bookings = await req.bookingsCollection
            .find({ userId })
            .sort({ createdAt: -1 })
            .toArray();
        res.send({
            success: true,
            bookings,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to fetch user bookings",
        });
    }
});
app.get("/api/bookings/:id", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(`${id}`),
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to fetch booking",
        });
    }
});
app.get("/api/user/bookings/statistics/:userId", useDb, async (req, res) => {
    try {
        const { userId } = req.params;
        const bookings = await req.bookingsCollection.find({ userId }).toArray();
        const totalBookings = bookings.length;
        const confirmedBookings = bookings.filter((booking) => booking.bookingStatus === "confirmed").length;
        const cancelledBookings = bookings.filter((booking) => booking.bookingStatus === "cancelled").length;
        const totalSpent = bookings
            .filter((booking) => booking.paymentStatus === "paid")
            .reduce((total, booking) => total + Number(booking.totalPrice || 0), 0);
        const monthlyStatistics = {};
        bookings.forEach((booking) => {
            const date = new Date(booking.bookingDate);
            const month = date.toLocaleString("default", { month: "short" });
            if (!monthlyStatistics[month]) {
                monthlyStatistics[month] = {
                    month,
                    bookings: 0,
                    cancelledBookings: 0,
                    spending: 0,
                };
            }
            monthlyStatistics[month].bookings += 1;
            if (booking.bookingStatus === "cancelled") {
                monthlyStatistics[month].cancelledBookings += 1;
            }
            if (booking.paymentStatus === "paid") {
                monthlyStatistics[month].spending += Number(booking.totalPrice || 0);
            }
        });
        const monthOrder = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        const chartData = Object.values(monthlyStatistics).sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
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
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to load booking statistics",
        });
    }
});
app.post("/api/bookings", useDb, async (req, res) => {
    try {
        const booking = {
            ...req.body,
            paymentStatus: "pending",
            bookingStatus: "pending",
            stripeSessionId: null,
            stripePaymentIntentId: null,
            createdAt: new Date(),
        };
        const result = await req.bookingsCollection.insertOne(booking);
        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            booking,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to create booking",
        });
    }
});
app.patch("/api/bookings/:id/cancel", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(`${id}`),
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
        await req.bookingsCollection.updateOne({ _id: booking._id }, {
            $set: {
                bookingStatus: "cancelled",
                cancelledAt: new Date(),
            },
        });
        res.send({
            success: true,
            message: "Booking cancelled successfully.",
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to cancel booking.",
        });
    }
});
app.delete("/api/bookings/:id", useDb, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(`${id}`),
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
        await req.bookingsCollection.deleteOne({
            _id: new ObjectId(`${id}`),
        });
        res.send({
            success: true,
            message: "Booking deleted successfully",
        });
    }
    catch (error) {
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
app.post("/api/create-checkout-session", useDb, async (req, res) => {
    try {
        const stripe = getStripe();
        const { bookingId } = req.body;
        if (!bookingId) {
            return res.status(400).send({
                success: false,
                message: "Booking ID is required",
            });
        }
        const booking = await req.bookingsCollection.findOne({
            _id: new ObjectId(`${bookingId}`),
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
        await req.bookingsCollection.updateOne({ _id: booking._id }, {
            $set: {
                stripeSessionId: session.id,
            },
        });
        res.send({
            success: true,
            url: session.url,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Failed to create checkout session",
        });
    }
});
// ==========================================
// 4. Port Listener (Local Development only)
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
// ==========================================
// 5. Export for Vercel
// ==========================================
export default app;
