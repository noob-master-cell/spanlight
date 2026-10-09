"""Request and response bodies shared across routers, split by the resource they describe.

The wire format, with its clarifications, is described in docs/api-deviations.md.

Every public name is re-exported here, so routers import from `app.api.schemas` and never from a
resource module. Shared building blocks live in `common`; a model lives with the resource it
describes, and a module that embeds another resource's model imports it from there.
"""

from app.api.schemas.auth import (
    AcceptedOut,
    EmailVerifyConfirmIn,
    LoginIn,
    LoginOut,
    LoginSignedInOut,
    LoginTotpRequiredOut,
    MembershipOut,
    MeOut,
    OAuthIdentityOut,
    OAuthProviderOut,
    PasswordForgotIn,
    PasswordResetIn,
    SessionOut,
    SignupIn,
    TotpCodeIn,
    TotpEnabledOut,
    TotpSetupOut,
    TotpStatusOut,
    TotpVerifyIn,
)
from app.api.schemas.common import ApiModel, Money, Name, Page, UserOut
from app.api.schemas.keys import ApiKeyCreatedOut, ApiKeyCreateIn, ApiKeyOut
from app.api.schemas.metrics import KpisOut, ModelMetricsOut, OverviewOut, TimeseriesPointOut
from app.api.schemas.orgs import (
    AuditEventOut,
    InviteAcceptIn,
    InviteCreatedOut,
    InviteCreateIn,
    InviteOrgOut,
    InviteOut,
    InvitePreviewOut,
    MemberOut,
    MemberUpdateIn,
    OrgCreateIn,
    OrgDeleteIn,
    OrgOut,
    OrgUpdateIn,
    OrgWithRoleOut,
)
from app.api.schemas.prices import PriceOut, UnpricedModelOut
from app.api.schemas.projects import (
    OnboardingOut,
    ProjectCreateIn,
    ProjectDeleteIn,
    ProjectOut,
    ProjectUpdateIn,
)
from app.api.schemas.tokens import (
    PersonalAccessTokenCreatedOut,
    PersonalAccessTokenCreateIn,
    PersonalAccessTokenOut,
)
from app.api.schemas.traces import (
    FiltersOut,
    SessionSummaryOut,
    SpanOut,
    TraceDetailOut,
    TraceSummaryOut,
)

__all__ = [
    "AcceptedOut",
    "ApiKeyCreateIn",
    "ApiKeyCreatedOut",
    "ApiKeyOut",
    "ApiModel",
    "AuditEventOut",
    "EmailVerifyConfirmIn",
    "FiltersOut",
    "InviteAcceptIn",
    "InviteCreateIn",
    "InviteCreatedOut",
    "InviteOrgOut",
    "InviteOut",
    "InvitePreviewOut",
    "KpisOut",
    "LoginIn",
    "LoginOut",
    "LoginSignedInOut",
    "LoginTotpRequiredOut",
    "MeOut",
    "MemberOut",
    "MemberUpdateIn",
    "MembershipOut",
    "ModelMetricsOut",
    "Money",
    "Name",
    "OAuthIdentityOut",
    "OAuthProviderOut",
    "OnboardingOut",
    "OrgCreateIn",
    "OrgDeleteIn",
    "OrgOut",
    "OrgUpdateIn",
    "OrgWithRoleOut",
    "OverviewOut",
    "Page",
    "PasswordForgotIn",
    "PasswordResetIn",
    "PersonalAccessTokenCreateIn",
    "PersonalAccessTokenCreatedOut",
    "PersonalAccessTokenOut",
    "PriceOut",
    "ProjectCreateIn",
    "ProjectDeleteIn",
    "ProjectOut",
    "ProjectUpdateIn",
    "SessionOut",
    "SessionSummaryOut",
    "SignupIn",
    "SpanOut",
    "TimeseriesPointOut",
    "TotpCodeIn",
    "TotpEnabledOut",
    "TotpSetupOut",
    "TotpStatusOut",
    "TotpVerifyIn",
    "TraceDetailOut",
    "TraceSummaryOut",
    "UnpricedModelOut",
    "UserOut",
]
