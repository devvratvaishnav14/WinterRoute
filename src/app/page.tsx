import { TripForm } from "@/components/trip/TripForm";

export default function Home() {
  // TripForm owns the background per view mode: `.atmosphere-bg` (static,
  // neutral) for the form/loading views, `WeatherSceneBackground` (the
  // selected commute's resolved forecast) for the results view. This
  // outer div is just a solid fallback so there's never a flash of the
  // default white background before either mounts.
  return (
    <div className="min-h-screen bg-[#0b1220]">
      <TripForm />
    </div>
  );
}
