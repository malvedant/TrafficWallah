package com.smarttraffic.violation.dto;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ViolationResponse {

    private Long id;
    private String vehicleId;
    private Integer speed;
    private String zone;
    private Integer fine;
    private Boolean isEmergency;
    private LocalDateTime createdAt;
}
