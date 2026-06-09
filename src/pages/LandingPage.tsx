import { Link } from 'react-router-dom'

const features = [
  {
    icon: '⚔️',
    title: 'Battle Through Knowledge',
    description:
      'Answer questions correctly to deal damage, cast spells, and unlock powerful abilities. Every correct answer fuels your character.',
  },
  {
    icon: '🌐',
    title: 'Multiplayer Realms',
    description:
      'Team up or compete with other learners in real time. Form parties, join guilds, and tackle cooperative knowledge dungeons.',
  },
  {
    icon: '📈',
    title: 'Skill Trees & Progression',
    description:
      'Earn XP across subjects — Math, Science, History, Language Arts, and more. Unlock specializations as your knowledge grows.',
  },
  {
    icon: '🗺️',
    title: 'Living World',
    description:
      'Explore an ever-expanding world of biomes and dungeons tied to educational curriculum. New content drops each semester.',
  },
  {
    icon: '🏆',
    title: 'Leaderboards & Guilds',
    description:
      'Compete in weekly academic tournaments, climb class leaderboards, and earn rare cosmetic rewards for your character.',
  },
  {
    icon: '🎓',
    title: 'Teacher Dashboard',
    description:
      'Educators can assign quests, customize question sets, and track individual student progress through an intuitive dashboard.',
  },
]

const classes = [
  { name: 'Scholar', icon: '📚', color: 'from-blue-600 to-blue-800', role: 'Support / Healer', desc: 'Masters of lore who heal allies with correct answers.' },
  { name: 'Arcanist', icon: '🔮', color: 'from-purple-600 to-purple-900', role: 'Mage / DPS', desc: 'Harnesses arcane energy through mathematical precision.' },
  { name: 'Ranger', icon: '🏹', color: 'from-green-600 to-green-900', role: 'Scout / DPS', desc: 'Swift and accurate — rewards speed and streak bonuses.' },
  { name: 'Paladin', icon: '🛡️', color: 'from-yellow-600 to-yellow-800', role: 'Tank / Support', desc: 'Steadfast defenders who grow stronger with consistency.' },
]

export default function LandingPage() {
  return (
    <main className="pt-16">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-screen text-center px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-lumen-purple/30 via-transparent to-transparent pointer-events-none" />
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.3) 39px,rgba(255,255,255,.3) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.3) 39px,rgba(255,255,255,.3) 40px)',
          }}
        />
        <p className="text-lumen-gold font-display tracking-[0.3em] text-sm mb-4 uppercase">
          The Multiplayer Educational RPG
        </p>
        <h1 className="font-display text-6xl md:text-8xl font-bold mb-6 leading-tight">
          <span className="text-white">Learn.</span>{' '}
          <span className="text-lumen-gold">Quest.</span>{' '}
          <span className="text-lumen-violet">Conquer.</span>
        </h1>
        <p className="max-w-2xl text-gray-300 text-lg md:text-xl mb-10 leading-relaxed">
          Lumen is a browser-based multiplayer RPG where your intellect is your greatest weapon.
          Level up your character by answering questions, explore vast knowledge realms, and compete
          with classmates in real time.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to="/play"
            className="px-8 py-4 rounded-xl bg-lumen-violet hover:bg-purple-600 font-semibold text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30"
          >
            Enter the Realm
          </Link>
          <a
            href="#features"
            className="px-8 py-4 rounded-xl border border-white/20 hover:border-white/50 font-semibold text-lg transition-all hover:bg-white/5"
          >
            Learn More
          </a>
        </div>
        <div className="absolute bottom-8 animate-bounce text-gray-500 text-2xl">↓</div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-lumen-gold font-display tracking-widest text-sm uppercase mb-3">
            Game Features
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-bold">Why Play Lumen?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-lumen-violet/50 transition-all group"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="font-display font-semibold text-lg mb-2 group-hover:text-lumen-gold transition-colors">
                {f.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Classes */}
      <section className="py-24 px-6 bg-lumen-navy/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-lumen-gold font-display tracking-widest text-sm uppercase mb-3">
              Choose Your Path
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold">Character Classes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {classes.map((c) => (
              <div
                key={c.name}
                className="rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:-translate-y-1 group"
              >
                <div className={`h-32 bg-gradient-to-br ${c.color} flex items-center justify-center text-6xl`}>
                  {c.icon}
                </div>
                <div className="p-5 bg-lumen-navy">
                  <h3 className="font-display font-bold text-lg mb-1 group-hover:text-lumen-gold transition-colors">
                    {c.name}
                  </h3>
                  <p className="text-lumen-violet text-xs font-semibold mb-2">{c.role}</p>
                  <p className="text-gray-400 text-sm">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-lumen-violet/20 via-transparent to-transparent pointer-events-none" />
        <h2 className="font-display text-4xl md:text-6xl font-bold mb-6">
          Your Quest Begins Now
        </h2>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-10">
          Join thousands of students already leveling up their knowledge across the realm of Lumen.
        </p>
        <Link
          to="/play"
          className="inline-block px-10 py-5 rounded-xl bg-lumen-gold text-lumen-dark font-bold text-xl hover:brightness-110 transition-all hover:scale-105"
        >
          Play for Free
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6 text-center text-gray-600 text-sm">
        <p className="font-display tracking-widest text-lumen-gold/50 mb-2">LUMEN</p>
        <p>© 2026 Lumen Project. All rights reserved.</p>
      </footer>
    </main>
  )
}
