import { Login } from "@/components/login";
export default function Page() {
  return (
    <Login
      demo={false}
      ready={Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      )}
    />
  );
}
