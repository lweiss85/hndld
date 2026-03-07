import {
  IconHome,
  IconSchedule,
  IconMessages,
  IconProfile,
  IconSpending,
  IconTasks,
  IconSparkle,
  IconCleaning,
  IconCare,
  IconProvider,
  IconReferrals,
  IconRatings,
  IconAlert,
  IconComplete,
  IconClock,
  IconSettings,
  type HndldIconProps,
} from "@/components/icons/hndld-icons";

const icons: { name: string; component: React.FC<HndldIconProps> }[] = [
  { name: "IconHome", component: IconHome },
  { name: "IconSchedule", component: IconSchedule },
  { name: "IconMessages", component: IconMessages },
  { name: "IconProfile", component: IconProfile },
  { name: "IconSpending", component: IconSpending },
  { name: "IconTasks", component: IconTasks },
  { name: "IconSparkle", component: IconSparkle },
  { name: "IconCleaning", component: IconCleaning },
  { name: "IconCare", component: IconCare },
  { name: "IconProvider", component: IconProvider },
  { name: "IconReferrals", component: IconReferrals },
  { name: "IconRatings", component: IconRatings },
  { name: "IconAlert", component: IconAlert },
  { name: "IconComplete", component: IconComplete },
  { name: "IconClock", component: IconClock },
  { name: "IconSettings", component: IconSettings },
];

const sizes = [16, 20, 24, 32, 48] as const;

export default function IconGallery() {
  return (
    <div className="min-h-screen p-6 space-y-10">
      <h1 className="text-2xl font-bold">hndld Icon Gallery</h1>

      <section style={{ backgroundColor: "#F8F6F3" }} className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-6 text-gray-900">Light Background</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-6">
          {icons.map(({ name, component: Icon }) => (
            <div key={name} className="flex flex-col items-center gap-3">
              <span className="text-xs font-mono text-gray-600">{name}</span>
              <div className="flex items-end gap-2">
                {sizes.map((s) => (
                  <Icon key={s} size={s} className="text-gray-900" />
                ))}
              </div>
              <div className="flex gap-1 text-[10px] text-gray-400">
                {sizes.map((s) => (
                  <span key={s} style={{ width: s, textAlign: "center" }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ backgroundColor: "#1A2332" }} className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-6 text-white">Dark Background</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-6">
          {icons.map(({ name, component: Icon }) => (
            <div key={name} className="flex flex-col items-center gap-3">
              <span className="text-xs font-mono text-gray-400">{name}</span>
              <div className="flex items-end gap-2">
                {sizes.map((s) => (
                  <Icon key={s} size={s} className="text-white" />
                ))}
              </div>
              <div className="flex gap-1 text-[10px] text-gray-500">
                {sizes.map((s) => (
                  <span key={s} style={{ width: s, textAlign: "center" }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
