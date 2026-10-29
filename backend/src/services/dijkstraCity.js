class PriorityQueue {
  constructor() {
    this.values = [];
  }

  enqueue(val, priority) {
    this.values.push({ val, priority });
    this.sort();
  }

  dequeue() {
    return this.values.shift();
  }

  sort() {
    this.values.sort((a, b) => a.priority - b.priority);
  }
}

const nodePositions = {
  A: { lat: 16.5400, lng: 81.5200, name: 'SRKR College Route' },
  B: { lat: 16.5450, lng: 81.5300, name: 'Bhimavaram Town Center' },
  C: { lat: 16.5478, lng: 81.5201, name: 'ASR Hospital / North Gate' },
  D: { lat: 16.5500, lng: 81.5150, name: 'JNTU Campus' },
  E: { lat: 16.5385, lng: 81.5280, name: 'DNR College / P.P. Road' },
  F: { lat: 16.5420, lng: 81.5350, name: 'Someswara Swamy Temple' },
  G: { lat: 16.5350, lng: 81.5240, name: 'Mavullamma Temple' },
  H: { lat: 16.5550, lng: 81.5250, name: 'Mentay Vari Thota' },
  I: { lat: 16.5300, lng: 81.5100, name: 'Undi Road Junction' }
};

// Initial graph weights (travel time in mins)
const cityGraph = {
  A: { B: 4, D: 5 },
  B: { A: 4, C: 3, E: 2 },
  C: { B: 3, F: 6 },
  D: { A: 5, E: 4, G: 3 },
  E: { B: 2, D: 4, F: 4, H: 5 },
  F: { C: 6, E: 4, I: 2 },
  G: { D: 3, H: 6 },
  H: { E: 5, G: 6, I: 5 },
  I: { F: 2, H: 5 }
};

function dijkstraFast(graph, start, end) {
  const distances = {};
  const previous = {};
  const pq = new PriorityQueue();
  const path = [];

  for (let vertex in graph) {
    distances[vertex] = vertex === start ? 0 : Infinity;
    pq.enqueue(vertex, distances[vertex]);
    previous[vertex] = null;
  }

  while (pq.values.length) {
    let smallest = pq.dequeue().val;

    if (smallest === end) {
      while (previous[smallest]) {
        path.push(smallest);
        smallest = previous[smallest];
      }
      break;
    }

    if (smallest || distances[smallest] !== Infinity) {
      for (let neighbor in graph[smallest]) {
        let candidate = distances[smallest] + graph[smallest][neighbor];
        if (candidate < distances[neighbor]) {
          distances[neighbor] = candidate;
          previous[neighbor] = smallest;
          pq.enqueue(neighbor, candidate);
        }
      }
    }
  }

  return {
    path: path.concat(start).reverse(),
    totalTime: distances[end]
  };
}

function updateTraffic() {
  const nodes = Object.keys(cityGraph);
  for (let u of nodes) {
    for (let v in cityGraph[u]) {
      // Randomly adjust weight by -2 to +2
      let change = Math.floor(Math.random() * 5) - 2;
      let newWeight = cityGraph[u][v] + change;

      // Clamp between 1 and 15 mins to simulate realistic traffic spikes
      if (newWeight < 1) newWeight = 1;
      if (newWeight > 15) newWeight = 15;

      cityGraph[u][v] = newWeight;
      cityGraph[v][u] = newWeight; // Undirected road
    }
  }
  return cityGraph;
}

// Auto update traffic weights every 10 seconds to simulate city flow
setInterval(updateTraffic, 10000);

module.exports = {
  cityGraph,
  nodePositions,
  dijkstraFast,
  updateTraffic
};
