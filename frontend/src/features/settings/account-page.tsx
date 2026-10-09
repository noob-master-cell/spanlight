import { ProfileSection } from "./profile-section";
import { SessionsSection } from "./sessions-section";
import { SignOutSection } from "./sign-out-section";

export function AccountPage() {
  return (
    <div className="flex flex-col gap-5">
      <ProfileSection />
      <SessionsSection />
      <SignOutSection />
    </div>
  );
}
