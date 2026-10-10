import { CloudRain, Thermometer, Droplets, Wind } from 'lucide-react';

// Illustrative preview only; values are decorative, not live data.
const temps = [24, 25, 24, 22, 20, 18, 18, 20, 23, 26, 25, 24];
const rain = [210, 190, 150, 60, 10, 2, 0, 1, 8, 40, 120, 190];

const W = 360, H = 130, PAD = 6;
const x = (i) => PAD + (i * (W - PAD * 2)) / (temps.length - 1);
const y = (v) => H - PAD - ((v - 14) / (30 - 14)) * (H - PAD * 2);
const line = temps.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

const tiles = [
  { icon: Thermometer, label: 'Temperature', value: '25.5°C' },
  { icon: CloudRain, label: 'Rainfall', value: '7.3 mm' },
  { icon: Droplets, label: 'Humidity', value: '51%' },
  { icon: Wind, label: 'Wind', value: '3.7 m/s' },
];

export default function HeroPreview() {
  return (
    <div className="preview" role="img" aria-label="Illustration of the CDIMS dashboard with temperature and rainfall chart">
      <div className="preview-bar"><i /><i /><i /><span>Climate overview</span></div>
      <div className="preview-body">
        <div className="preview-tiles">
          {tiles.map(({ icon: Icon, label, value }, i) => (
            <div className="ptile" key={label} style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
              <Icon size={14} />
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="preview-chart" preserveAspectRatio="none">
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="grid-line" />
          ))}
          {rain.map((v, i) => (
            <rect key={i} x={x(i) - 9} width="18" rx="3" className="bar"
              y={H - PAD - (v / 220) * (H - PAD * 2)} height={(v / 220) * (H - PAD * 2)}
              style={{ animationDelay: `${0.7 + i * 0.05}s` }} />
          ))}
          <path d={line} className="trace" pathLength="1" />
        </svg>
        <div className="preview-legend"><span className="dot-line" /> Avg temperature <span className="dot-bar" /> Rainfall</div>
      </div>
    </div>
  );
}
