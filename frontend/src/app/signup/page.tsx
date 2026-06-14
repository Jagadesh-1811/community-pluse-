import AuthForm from '@/components/auth/AuthForm';

export default function SignupPage() {
  return (
    <main className="min-h-[calc(100vh-80px)] bg-(--background) brutalist-grid flex items-center justify-center p-6 relative overflow-hidden font-outfit pt-20">
      <AuthForm initialMode="signup" />
    </main>
  );
}
