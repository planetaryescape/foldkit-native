# foldkit-native documentation

An independent, unofficial experiment in running upstream Foldkit application logic with true native platform bindings. Not affiliated with Foldkit or Expo.

| Record                                        | Purpose                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| [Blueprint](blueprint/README.md)              | Intended contracts, accepted goals, and proposed architecture |
| [Implementation plan](implementation-plan.md) | Ordered milestones and observable completion gates            |

Read the overview, architecture, relevant decisions, then the plan. Code establishes current behavior; the blueprint is not implementation evidence. Delivery history belongs in `docs/implementation-log.md`, maintained separately when work is recorded.

## Evidence boundary

This documentation was initially drafted against an empty repository on 2026-11-15. Implementation is now in progress. These documents do not establish native build, physical-device, or development-host verification.

An accepted product goal is not proof of runtime compatibility. Public Foldkit command/update reuse and the project's experimental native runner are distinct responsibilities. Source paths are plain text; implementation evidence belongs in the delivery history.
