import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

    const spacesCollection = database.collection("spaces");
    const bookingsCollection = database.collection("bookings");

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

        // Location
        if (location && location !== "All") {
          query.location = category;
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

    // Create Booking
    app.post("/api/bookings", async (req, res) => {
      try {
        const booking = {
          ...req.body,
          paymentStatus: "pending",
          bookingStatus: "pending",
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
