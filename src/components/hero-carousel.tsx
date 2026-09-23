"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
const slides = [
  {
    id: "lifestyle",
    name: "生活写真",
    title: "Little moments,",
    word: "beautifully lived.",
    label: "LIFESTYLE / 把日子过成喜欢的样子",
  },
  {
    id: "speaker",
    name: "讲师介绍",
    title: "Share your",
    word: "perspective.",
    label: "SPEAKER / 让经验成为影响力",
  },
  {
    id: "personal-ip",
    name: "个人 IP",
    title: "Simply,",
    word: "be yourself.",
    label: "PERSONAL BRAND / 真实，自有光芒",
  },
];
export function HeroCarousel({ onExplore }: { onExplore: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
  }, []);
  useEffect(() => {
    if (paused || interacting) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [paused, interacting, index]);
  return (
    <section
      className="hero-carousel"
      aria-roledescription="轮播图"
      aria-label="人物海报灵感"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setInteracting(false);
      }}
    >
      <button
        className="hero-art"
        onClick={onExplore}
        aria-label={`探索${slides[index].name}灵感模板`}
      >
        {slides.map((s, i) => (
          <img
            key={s.id}
            className={i === index ? "active" : ""}
            src={`/artwork/${s.id}.webp`}
            alt={i === index ? s.name : ""}
            aria-hidden={i !== index}
          />
        ))}
        <span className="hero-art-title">
          <span>{slides[index].title}</span>
          <em>{slides[index].word}</em>
        </span>
        <span className="hero-art-label">
          {slides[index].label}
          <ArrowUpRight size={19} />
        </span>
      </button>
      <div className="carousel-controls">
        <div className="carousel-tabs">
          {slides.map((s, i) => (
            <button
              key={s.id}
              className={i === index ? "active" : ""}
              aria-label={`切换到${s.name}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <i />
              {s.name}
            </button>
          ))}
        </div>
        <button
          className="carousel-pause"
          aria-label={paused ? "播放轮播" : "暂停轮播"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
      </div>
    </section>
  );
}
