import ExpoModulesCore
import HealthKit

/// Reads the heart rate zones Apple Watch uses, as set in Health: automatic
/// from the person's health metrics, or their own.
public class HeartRateZonesModule: Module {
  private let store = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("HeartRateZones")

    /// Where zones 2 and up start (bpm, ascending), or nil before iOS 27,
    /// which added the API, or when Health has no zones.
    AsyncFunction("preferredZoneStarts") { () async throws -> [Double]? in
      guard HKHealthStore.isHealthDataAvailable() else { return nil }
      #if compiler(>=6.3)
      if #available(iOS 27.0, *) {
        return try await self.preferredZoneStarts()
      }
      #endif
      return nil
    }
  }

  // Built only with the iOS 27 SDK (Xcode 27, Swift 6.3 on), which has the
  // API; built with an older one, the module reads no zones.
  #if compiler(>=6.3)
  @available(iOS 27.0, *)
  private func preferredZoneStarts() async throws -> [Double]? {
    let heartRate = HKQuantityType(.heartRate)
    guard let configuration = try await store.preferredWorkoutZoneConfiguration(for: heartRate) else {
      return nil
    }
    let bpm = HKUnit.count().unitDivided(by: .minute())
    // Zone 1 starts from nothing; each later one at its minimum.
    let starts = configuration.zones
      .sorted { $0.index < $1.index }
      .dropFirst()
      .compactMap { $0.minimum?.doubleValue(for: bpm) }
    return starts.isEmpty ? nil : starts
  }
  #endif
}
