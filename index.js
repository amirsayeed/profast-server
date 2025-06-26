// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());


const {
    MongoClient,
    ServerApiVersion
} = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tnmpmcr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db('parcelDB');
        const parcelsCollection = db.collection('parcels');


        // GET all parcels OR filter by created_by email
        app.get('/parcels', async (req, res) => {
            try {
                const email = req.query.email;

                let query = {};
                if (email) {
                    query = {
                        created_by: email
                    };
                }

                const parcels = await parcelsCollection
                    .find(query)
                    .sort({
                        createdAt: -1
                    }) // latest first
                    .toArray();

                res.send(parcels);
            } catch (error) {
                res.status(500).send({
                    message: error.message
                });
            }
        });


        app.post('/parcels', async (req, res) => {
            try {
                const parcelData = req.body;
                const result = await parcelsCollection.insertOne(parcelData);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({
                    message: error.message
                });
            }
        });


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({
        //     ping: 1
        // });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


// Default route
app.get('/', (req, res) => {
    res.send('Parcel Server is running!');
});

// Start server
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});