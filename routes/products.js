const express = require('express')
const router = express.Router()
const Product = require('../models/Product')

router.get('/fetchallproduct',
    async (req, res)=>{
        try {
            console.log("helloo");
            
            const response = await fetch('https://s3.amazonaws.com/roxiler.com/product_transaction.json',{
                method:'GET',
                headers:{
                    'Content-Type': 'application/json',
                }
            });
            const products = await response.json();
            await Product.deleteMany();
            await Product.insertMany(products)
            await Product.find().sort({"dateOfSale":1})
            res.status(200).send(products)        
        } catch (error) {
            console.log(error.message);
            res.status(500).send('Internal Server Error')
        }
    }
)
router.post('/getproduct',
    async (req, res)=>{
        const { search, page = 1, perPage = 10 } = req.body; // Default values
        const query = {};

  // Initialize an array for the search conditions
  const searchConditions = [];

  // Check if search is numeric
  if (search && !isNaN(search)) {
    // If it's numeric, add it to the price condition
    const numericSearch = parseFloat(search);
    searchConditions.push({ price: numericSearch });
  } else if (search) {
    // Create regex for string search in title and description
    const regex = new RegExp(search, 'i');
    searchConditions.push({ title: regex });
    searchConditions.push({ description: regex });
  }

  // Combine the conditions using $or if there are any
  if (searchConditions.length > 0) {
    query.$or = searchConditions;
  }

  try {
    // Get total count and fetch products
    console.log(query);
    
    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .skip((page - 1) * perPage)
      .limit(parseInt(perPage));

    res.status(200).json({
      total,
      page: parseInt(page),
      perPage: parseInt(perPage),
      products
    });
  } catch (error) {
    res.status(500).send('Error fetching transactions: ' + error.message);
  }
    }
)

router.get('/statistics', async (req, res) => {
  const { month } = req.body; // Get the month from the query parameter
  if (!month) {
    return res.status(400).json({ message: "Month is required" });
  }
  console.log(month);
  
  // Define the start and end of the month
  const startDate = new Date(`2021-${month}-01T00:00:00Z`); // Adjust year as needed
  const endDate = new Date(startDate);
  endDate.setMonth(startDate.getMonth() + 1);

  try {
    // Calculate total sale amount
    const totalSales = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          },
          sold: true
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$price" }
        }
      }
    ]);

    // Calculate total sold items
    const totalSoldItems = await Product.countDocuments({
      $expr: {
        $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
      },
      sold: true
    });

    // Calculate total not sold items
    const totalNotSoldItems = await Product.countDocuments({
      $expr: {
        $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
      },
      sold: false
    });

    res.status(200).json({
      totalSales: totalSales.length > 0 ? totalSales[0].totalAmount : 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    res.status(500).send('Error fetching statistics: ' + error.message);
  }
});


router.get('/bar-chart', async (req, res) => {
  const { month } = req.body; // Get the month from query
  console.log(month);

  if (!month) {
    return res.status(400).json({ message: "Valid month (1-12) is required" });
  }

  try {
    const data = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          }
        }
      },
      {
        $bucket: {
          groupBy: "$price", // Grouping by price
          boundaries: [0, 101, 201, 301, 401, 501, 601, 701, 801, 901, Infinity], // Price ranges
          default: "901-above", // Default category for prices above 901
          output: {
            count: { $sum: 1 }, // Count the number of items in each range
            soldCount: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } }, // Count sold items in range
            notSoldCount: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } } // Count unsold items in range
          }
        }
      }
    ]);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).send('Error fetching bar chart data: ' + error.message);
  }
});

router.post('/pie-chart', async (req, res) => {
  const { month } = req.body; // Get the month from query
  if (!month) {
    return res.status(400).json({ message: "Valid month (1-12) is required" });
  }

  try {
    const data = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          }
        }
      },
      {
        $group: {
          _id: "$category", // Group by category
          count: { $sum: 1 } // Count items in each category
        }
      }
    ]);

    const result = data.map(item => ({
      category: item._id,
      items: item.count
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).send('Error fetching pie chart data: ' + error.message);
  }
});


router.post('/combined-data', async (req, res) => {
  const { month } = req.body;

  if (!month || month < 1 || month > 12) {
    return res.status(400).json({ message: "Valid month (1-12) is required" });
  }

  try {
    // Call statistics API
    const statistics = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$price" },
          soldItems: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
          notSoldItems: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
        }
      }
    ]);

    // Call bar chart API
    const barChart = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          }
        }
      },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [0, 101, 201, 301, 401, 501, 601, 701, 801, 901, Infinity],
          default: "901-above",
          output: {
            count: { $sum: 1 },
            soldCount: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
            notSoldCount: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
          }
        }
      }
    ]);

    // Call pie chart API
    const pieChart = await Product.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $substr: ['$dateOfSale', 5, 2] }, month.padStart(2, '0')]
          }
        }
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      }
    ]);

    const combinedResponse = {
      statistics: statistics[0] || { totalSales: 0, soldItems: 0, notSoldItems: 0 },
      barChart,
      pieChart: pieChart.map(item => ({ category: item._id, items: item.count }))
    };

    res.status(200).json(combinedResponse);
  } catch (error) {
    res.status(500).send('Error fetching combined data: ' + error.message);
  }
});

module.exports = router