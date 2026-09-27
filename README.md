# Daily Planner (QVAC)

Write your to-do list (add times like (30m) or (1h), and ! for important tasks), set when your day starts and ends, and add fixed appointments. An **on-device AI** suggests a smart order and fills in time estimates, then the app builds a **timeline for your day** around your appointments, with short breaks after long focus sessions. Tick tasks off as you go, and the current block is highlighted.

It runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source AI SDK.
No API key, no cloud service, and what you type never leaves your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `completion` (with structured output via `responseFormat`), with the `LLAMA_3_2_1B_INST_Q4_0` model.

## Install

You need [Node.js](https://nodejs.org) 22 or newer and some free disk space for the model.

```bash
git clone https://github.com/misaki-codex/qvac-daily-planner.git
cd qvac-daily-planner
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3079** (the address, not the HTML file). The first start downloads the model.
While it loads, tasks are ordered by importance and size instead.

## How it works

- The AI only orders tasks and estimates missing times. The server matches every AI task back to one of yours, so nothing is invented or lost, and your own time estimates are always kept.
- **The timeline is plain code:** it skips over appointments, adds a 10-minute break after about 90 minutes of work, and lists anything that doesn't fit today.
- Your tasks, appointments and ticks are saved in your browser.
- The server listens on `127.0.0.1`, so only your own computer can reach it.

## Troubleshooting

If you see `RPC_INIT_TIMEOUT`, the QVAC worker was slow to start. `server.js` already waits 3 minutes.
Set `QVAC_RPC_INIT_TIMEOUT_MS` (milliseconds) before `npm start` to wait longer, and make sure no other
QVAC app is running at the same time. If you see `ERR_MODULE_NOT_FOUND`, delete the `node_modules` folder
and run `npm install` again (this usually means an install was interrupted, for example by a full disk).

## License

MIT
