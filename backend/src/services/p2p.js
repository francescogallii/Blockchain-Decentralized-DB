const WebSocket = require('ws');
const logger = require('../utils/logger');

const P2P_PORT = process.env.P2P_PORT || 6001;
const peers = process.env.PEERS ? process.env.PEERS.split(',') : [];

const MESSAGE_TYPES = {
    CHAIN: 'CHAIN',
    BLOCK: 'BLOCK',
};

class P2pServer {
    constructor(blockchain) {
        this.blockchain = blockchain;
        this.sockets = [];
    }

    listen() {
        const server = new WebSocket.Server({ port: P2P_PORT });
        server.on('connection', socket => this.connectSocket(socket));
        this.connectToPeers();
        logger.info(`P2P server listening for connections on: ${P2P_PORT}`);
    }

    connectToPeers() {
        peers.forEach(peer => {
            const socket = new WebSocket(peer); 
            socket.on('open', () => this.connectSocket(socket));
            socket.on('error', (err) => {
                logger.warn(`Failed to connect to peer: ${peer}`, { error: err.message });
            });
        });
    }

    connectSocket(socket) {
        this.sockets.push(socket);
        logger.info('Socket connected');
        this.messageHandler(socket);
        this.sendChain(socket); // Invia la tua catena al nuovo peer
    }

    messageHandler(socket) {
        socket.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                logger.info('Received P2P message', { type: data.type });

                switch (data.type) {
                    case MESSAGE_TYPES.CHAIN:
                        await this.blockchain.replaceChain(data.chain);
                        break;
                    case MESSAGE_TYPES.BLOCK:
                        const added = await this.blockchain.addBlock(data.block);
                        if (added) {
                            // Se abbiamo aggiunto il blocco, lo ri-trasmettiamo per assicurarci che tutti lo ricevano
                            this.broadcastBlock(data.block);
                        }
                        break;
                }
            } catch (error) {
                logger.error('Error handling P2P message', { error: error.message });
            }
        });
        
        socket.on('close', () => {
            this.sockets = this.sockets.filter(s => s !== socket);
            logger.info('Socket disconnected');
        });

        socket.on('error', (err) => {
            this.sockets = this.sockets.filter(s => s !== socket);
            logger.warn('Socket error', { error: err.message });
        });
    }

    sendChain(socket) {
        socket.send(JSON.stringify({
            type: MESSAGE_TYPES.CHAIN,
            chain: this.blockchain.chain,
        }));
    }
    
    broadcastBlock(block) {
        this.sockets.forEach(socket => {
            socket.send(JSON.stringify({
                type: MESSAGE_TYPES.BLOCK,
                block: block,
            }));
        });
    }

    syncChains() {
        logger.info('Broadcasting entire chain to all peers.');
        this.sockets.forEach(socket => this.sendChain(socket));
    }
}

module.exports = P2pServer;