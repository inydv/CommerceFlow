====================================================================================================

# Event Loop Blocking

- Maan lo humare backend mein ek endpoint hai: GET /api/v1/performance/blocking
- Ye endpoint 5 seconds tak continuous calculation karta hai.
- Ab agar koi customer isi time: GET /api/v1/health
- call kare, toh health API bhi wait kar sakti hai.
- Kyunki heavy calculation main JavaScript thread ko busy rakhti hai. Jab tak woh complete nahi hoti, Event Loop doosre route handlers execute nahi kar pata.

- Node.js documentation bhi explain karti hai ki expensive work se Event Loop block hone par baaki clients ki latency aur throughput affect ho sakti hai.

- Event Loop - Ready asynchronous callbacks ko execute karne ka mechanism
- Main Thread - Node.js ka primary JavaScript execution thread
- Blocking - Main thread ko busy rakhna, jisse doosra JS work delay ho
- Synchronous - Function complete hone tak current JS execution aage na badhe
- Asynchronous - I/O ya timer ka wait karte waqt doosra work execute ho sake
- CPU-bound - CPU calculation bottleneck ho
- I/O-bound - Database, network, disk ka wait bottleneck ho
- Event Loop Lag - Callback ready hone aur execute hone ke beech ka extra delay
- Latency - Request complete hone mein laga time
- Throughput - Fixed time mein handle ki gayi requests

- await ka matlab ye nahi hai: Is function ko background mein execute karo.
- await ka matlab hai: Is expression ka result lo. Agar Promise pending hai toh current async function ko pause karo aur Promise settle hone par resume karo.

### Event Loop Lag

- Event Loop blocking sirf HTTP requests ko affect nahi karti. Timers bhi delay ho sakte hain.

```
// Demonstrates how synchronous work delays timer callbacks.
router.get('/timer-delay', (req, res) => {
  const start = performance.now();

  // This callback should become eligible after about 100 ms.
  setTimeout(() => {
    console.log(
      'Timer callback ran after:',
      Math.round(performance.now() - start),
      'ms'
    );
  }, 100);

  // Blocks the thread for about 5 seconds.
  heavyCalculation();

  res.json({
    success: true,
    message: 'Check the Node.js terminal for timer delay',
  });
});
```

- Timer 100 ms ka tha. Phir 5,000 ms baad kyu execute hua?
- Kyunki timer ready hone ke bawajood main thread busy tha.

====================================================================================================

# Worker Thread

- Worker Thread - Separate JavaScript execution thread
- Main Thread - Express request handlers chalane wala primary JS thread
- Offloading - Heavy task ko doosre thread par bhejna
- Message Passing - Main aur Worker ke beech data exchange
- Parallelism - Multiple CPU tasks ko parallel execute karna
- Concurrency Limit - Ek time par kitne jobs allow hain
- Worker Pool - Reusable workers ka group
- Worker Startup Overhead - New Worker banane mein lagne wala time/resources
- Task / Job - Worker ko diya gaya calculation ka kaam
- Task Queue - Pending jobs ki waiting list
- Queue Limit - Maximum kitni jobs wait kar sakti hain
- Backpressure - Capacity full hone par aur kaam accept na karna
- Worker Reuse - Same Worker par multiple tasks execute karna

- Ek important learning: Worker Thread ka purpose heavy calculation ko hamesha faster banana nahi hai. Uska main benefit hai main Event Loop ko responsive rakhna.

====================================================================================================
